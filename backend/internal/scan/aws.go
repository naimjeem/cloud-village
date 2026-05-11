package scan

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/apigateway"
	"github.com/aws/aws-sdk-go-v2/service/cloudfront"
	"github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/ecr"
	"github.com/aws/aws-sdk-go-v2/service/ecs"
	elbv2 "github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2"
	"github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sfn"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"

	"github.com/cloud-village/backend/internal/village"
)

type AWSArgs struct {
	Region          string
	Profile         string
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
}

type AWSService struct {
	ID          string
	Cluster     string
	ServiceName string
	ServiceArn  string
}

type AWSScanCache struct {
	Region                    string
	Profile                   string
	AccessKeyID               string
	SecretAccessKey           string
	SessionToken              string
	Components                []village.Component
	Connections               []village.Connection
	Services                  []AWSService
	DDBTablesByID             map[string]string
	LambdasByID               map[string]string
	ALBsByID                  map[string]string
	TargetGroupArnByServiceID map[string]string
	ComponentByName           map[string]string
}

var (
	awsCacheMu sync.RWMutex
	awsCache   *AWSScanCache
)

func GetAWSCache() *AWSScanCache {
	awsCacheMu.RLock()
	defer awsCacheMu.RUnlock()
	return awsCache
}

func setAWSCache(c *AWSScanCache) {
	awsCacheMu.Lock()
	defer awsCacheMu.Unlock()
	awsCache = c
}

func loadAWSConfig(ctx context.Context, region, profile, accessKey, secretKey, sessionToken string) (aws.Config, error) {
	opts := []func(*awsconfig.LoadOptions) error{awsconfig.WithRegion(region)}
	if accessKey != "" && secretKey != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(accessKey, secretKey, sessionToken),
		))
	} else if profile != "" {
		opts = append(opts, awsconfig.WithSharedConfigProfile(profile))
	}
	return awsconfig.LoadDefaultConfig(ctx, opts...)
}

func AWS(ctx context.Context, args AWSArgs) (*village.Config, error) {
	cfg, err := loadAWSConfig(ctx, args.Region, args.Profile, args.AccessKeyID, args.SecretAccessKey, args.SessionToken)
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	cfgUSE1 := cfg.Copy()
	cfgUSE1.Region = "us-east-1"

	ecsCli := ecs.NewFromConfig(cfg)
	ddbCli := dynamodb.NewFromConfig(cfg)
	elbCli := elbv2.NewFromConfig(cfg)
	s3Cli := s3.NewFromConfig(cfg)
	ecrCli := ecr.NewFromConfig(cfg)
	cwlCli := cloudwatchlogs.NewFromConfig(cfg)
	lambdaCli := lambda.NewFromConfig(cfg)
	sqsCli := sqs.NewFromConfig(cfg)
	snsCli := sns.NewFromConfig(cfg)
	sfnCli := sfn.NewFromConfig(cfg)
	cfCli := cloudfront.NewFromConfig(cfgUSE1)
	apigwCli := apigateway.NewFromConfig(cfg)

	var (
		components  []village.Component
		connections []village.Connection
	)
	arnToID := map[string]string{}
	services := []AWSService{}
	ddbTablesByID := map[string]string{}
	lambdasByID := map[string]string{}
	albsByID := map[string]string{}
	targetGroupArnByServiceID := map[string]string{}

	ids := NewIDMaker()
	add := func(id, name string, kind village.ComponentKind, arn string, meta map[string]any) {
		components = append(components, village.Component{
			ID: id, Name: name, Kind: kind, Provider: village.ProviderAWS,
			Position: [2]float64{0, 0}, Health: village.HealthHealthy, Meta: meta,
		})
		if arn != "" {
			arnToID[arn] = id
		}
	}

	// --- ECS ---
	func() {
		clusters, err := ecsCli.ListClusters(ctx, &ecs.ListClustersInput{})
		if err != nil {
			log.Printf("ECS ListClusters: %v", err)
			return
		}
		for _, clusterArn := range clusters.ClusterArns {
			list, err := ecsCli.ListServices(ctx, &ecs.ListServicesInput{Cluster: aws.String(clusterArn)})
			if err != nil {
				log.Printf("ECS ListServices: %v", err)
				continue
			}
			if len(list.ServiceArns) == 0 {
				continue
			}
			desc, err := ecsCli.DescribeServices(ctx, &ecs.DescribeServicesInput{
				Cluster:  aws.String(clusterArn),
				Services: list.ServiceArns,
			})
			if err != nil {
				log.Printf("ECS DescribeServices: %v", err)
				continue
			}
			for _, s := range desc.Services {
				if s.ServiceArn == nil || s.ServiceName == nil {
					continue
				}
				id := ids.Make("ecs_"+*s.ServiceName, 80)
				clusterName := clusterArn
				if idx := strings.LastIndex(clusterArn, "/"); idx >= 0 {
					clusterName = clusterArn[idx+1:]
				}
				add(id, *s.ServiceName, village.KindCompute, *s.ServiceArn, map[string]any{
					"cluster": clusterName,
					"desired": s.DesiredCount,
					"running": s.RunningCount,
				})
				services = append(services, AWSService{
					ID: id, Cluster: clusterArn, ServiceName: *s.ServiceName, ServiceArn: *s.ServiceArn,
				})
				for _, lb := range s.LoadBalancers {
					if lb.TargetGroupArn != nil {
						arnToID["tg::"+*lb.TargetGroupArn] = id
						targetGroupArnByServiceID[id] = *lb.TargetGroupArn
					}
				}
			}
		}
	}()

	// --- Lambda ---
	func() {
		var marker *string
		for {
			r, err := lambdaCli.ListFunctions(ctx, &lambda.ListFunctionsInput{Marker: marker})
			if err != nil {
				log.Printf("Lambda ListFunctions: %v", err)
				return
			}
			for _, fn := range r.Functions {
				if fn.FunctionArn == nil || fn.FunctionName == nil {
					continue
				}
				id := ids.Make("lam_"+*fn.FunctionName, 80)
				mem := int32(0)
				if fn.MemorySize != nil {
					mem = *fn.MemorySize
				}
				add(id, *fn.FunctionName, village.KindCompute, *fn.FunctionArn, map[string]any{
					"runtime": string(fn.Runtime),
					"memory":  mem,
				})
				lambdasByID[id] = *fn.FunctionName
			}
			if r.NextMarker == nil || *r.NextMarker == "" {
				return
			}
			marker = r.NextMarker
		}
	}()

	// --- DynamoDB ---
	func() {
		var last *string
		for {
			r, err := ddbCli.ListTables(ctx, &dynamodb.ListTablesInput{ExclusiveStartTableName: last})
			if err != nil {
				log.Printf("DynamoDB ListTables: %v", err)
				return
			}
			for _, t := range r.TableNames {
				d, err := ddbCli.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(t)})
				if err != nil {
					continue
				}
				arn := ""
				if d.Table != nil && d.Table.TableArn != nil {
					arn = *d.Table.TableArn
				}
				id := ids.Make("ddb_"+t, 80)
				billing := "PROVISIONED"
				if d.Table != nil && d.Table.BillingModeSummary != nil {
					billing = string(d.Table.BillingModeSummary.BillingMode)
				}
				add(id, t, village.KindDatabase, arn, map[string]any{"kind": "dynamodb", "billing": billing})
				ddbTablesByID[id] = t
			}
			if r.LastEvaluatedTableName == nil || *r.LastEvaluatedTableName == "" {
				return
			}
			last = r.LastEvaluatedTableName
		}
	}()

	// --- ALBs ---
	lbArnToID := map[string]string{}
	func() {
		r, err := elbCli.DescribeLoadBalancers(ctx, &elbv2.DescribeLoadBalancersInput{})
		if err != nil {
			log.Printf("ELB DescribeLoadBalancers: %v", err)
			return
		}
		for _, lb := range r.LoadBalancers {
			if lb.LoadBalancerArn == nil || lb.LoadBalancerName == nil {
				continue
			}
			id := ids.Make("alb_"+*lb.LoadBalancerName, 80)
			add(id, *lb.LoadBalancerName, village.KindGateway, *lb.LoadBalancerArn, map[string]any{
				"type": string(lb.Type),
			})
			lbArnToID[*lb.LoadBalancerArn] = id
			albsByID[id] = *lb.LoadBalancerArn
		}
		for lbArn, lbID := range lbArnToID {
			ls, err := elbCli.DescribeListeners(ctx, &elbv2.DescribeListenersInput{LoadBalancerArn: aws.String(lbArn)})
			if err != nil {
				continue
			}
			for _, listener := range ls.Listeners {
				if listener.ListenerArn == nil {
					continue
				}
				rules, err := elbCli.DescribeRules(ctx, &elbv2.DescribeRulesInput{ListenerArn: listener.ListenerArn})
				if err != nil {
					continue
				}
				for _, rule := range rules.Rules {
					for _, a := range rule.Actions {
						if a.TargetGroupArn == nil {
							continue
						}
						target, ok := arnToID["tg::"+*a.TargetGroupArn]
						if !ok {
							continue
						}
						label := ""
						for _, c := range rule.Conditions {
							if c.Field != nil && *c.Field == "path-pattern" && len(c.Values) > 0 {
								label = c.Values[0]
								break
							}
						}
						connections = append(connections, village.Connection{
							ID:       fmt.Sprintf("c%d", len(connections)+1),
							From:     lbID,
							To:       target,
							Protocol: "http",
							Label:    label,
						})
					}
				}
			}
		}
	}()

	// --- S3 ---
	func() {
		r, err := s3Cli.ListBuckets(ctx, &s3.ListBucketsInput{})
		if err != nil {
			log.Printf("S3 ListBuckets: %v", err)
			return
		}
		for _, b := range r.Buckets {
			if b.Name == nil {
				continue
			}
			id := ids.Make("s3_"+*b.Name, 80)
			add(id, *b.Name, village.KindStorage, "arn:aws:s3:::"+*b.Name, nil)
		}
	}()

	// --- ECR ---
	func() {
		r, err := ecrCli.DescribeRepositories(ctx, &ecr.DescribeRepositoriesInput{})
		if err != nil {
			log.Printf("ECR DescribeRepositories: %v", err)
			return
		}
		for _, repo := range r.Repositories {
			if repo.RepositoryName == nil {
				continue
			}
			arn := ""
			if repo.RepositoryArn != nil {
				arn = *repo.RepositoryArn
			}
			id := ids.Make("ecr_"+*repo.RepositoryName, 80)
			add(id, *repo.RepositoryName, village.KindStorage, arn, nil)
		}
	}()

	// --- SQS ---
	func() {
		r, err := sqsCli.ListQueues(ctx, &sqs.ListQueuesInput{})
		if err != nil {
			log.Printf("SQS ListQueues: %v", err)
			return
		}
		for _, url := range r.QueueUrls {
			name := url
			if idx := strings.LastIndex(url, "/"); idx >= 0 {
				name = url[idx+1:]
			}
			id := ids.Make("sqs_"+name, 80)
			arn := ""
			a, err := sqsCli.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
				QueueUrl:       aws.String(url),
				AttributeNames: []sqstypes.QueueAttributeName{sqstypes.QueueAttributeNameQueueArn},
			})
			if err == nil {
				arn = a.Attributes[string(sqstypes.QueueAttributeNameQueueArn)]
			}
			add(id, name, village.KindQueue, arn, map[string]any{"kind": "sqs"})
		}
	}()

	// --- SNS ---
	func() {
		r, err := snsCli.ListTopics(ctx, &sns.ListTopicsInput{})
		if err != nil {
			log.Printf("SNS ListTopics: %v", err)
			return
		}
		for _, t := range r.Topics {
			if t.TopicArn == nil {
				continue
			}
			name := *t.TopicArn
			if idx := strings.LastIndex(name, ":"); idx >= 0 {
				name = name[idx+1:]
			}
			id := ids.Make("sns_"+name, 80)
			add(id, name, village.KindQueue, *t.TopicArn, map[string]any{"kind": "sns"})
		}
	}()

	// --- Step Functions ---
	func() {
		r, err := sfnCli.ListStateMachines(ctx, &sfn.ListStateMachinesInput{})
		if err != nil {
			log.Printf("SFN ListStateMachines: %v", err)
			return
		}
		for _, m := range r.StateMachines {
			if m.StateMachineArn == nil || m.Name == nil {
				continue
			}
			id := ids.Make("sfn_"+*m.Name, 80)
			add(id, *m.Name, village.KindCompute, *m.StateMachineArn, map[string]any{"kind": "step-function"})
		}
	}()

	// --- CloudFront ---
	func() {
		r, err := cfCli.ListDistributions(ctx, &cloudfront.ListDistributionsInput{})
		if err != nil {
			log.Printf("CloudFront ListDistributions: %v", err)
			return
		}
		if r.DistributionList == nil {
			return
		}
		for _, d := range r.DistributionList.Items {
			if d.Id == nil {
				continue
			}
			id := ids.Make("cf_"+*d.Id, 80)
			name := *d.Id
			if d.DomainName != nil {
				name = *d.DomainName
			}
			arn := ""
			if d.ARN != nil {
				arn = *d.ARN
			}
			comment := ""
			if d.Comment != nil {
				comment = *d.Comment
			}
			add(id, name, village.KindCDN, arn, map[string]any{"comment": comment})
		}
	}()

	// --- API Gateway REST ---
	func() {
		r, err := apigwCli.GetRestApis(ctx, &apigateway.GetRestApisInput{})
		if err != nil {
			log.Printf("APIGW GetRestApis: %v", err)
			return
		}
		for _, api := range r.Items {
			if api.Id == nil || api.Name == nil {
				continue
			}
			id := ids.Make("apigw_"+*api.Name, 80)
			add(id, *api.Name, village.KindGateway,
				fmt.Sprintf("arn:aws:apigateway:%s::/restapis/%s", args.Region, *api.Id), nil)
		}
	}()

	// --- CloudWatch Logs (collapse to one node) ---
	func() {
		r, err := cwlCli.DescribeLogGroups(ctx, &cloudwatchlogs.DescribeLogGroupsInput{Limit: aws.Int32(1)})
		if err != nil {
			log.Printf("CWLogs DescribeLogGroups: %v", err)
			return
		}
		if len(r.LogGroups) == 0 {
			return
		}
		id := ids.Make("cw_logs", 80)
		add(id, "CloudWatch Logs", village.KindMonitoring, "", map[string]any{"region": args.Region})
		for _, comp := range components {
			if comp.Kind == village.KindCompute && comp.ID != id {
				connections = append(connections, village.Connection{
					ID:       fmt.Sprintf("c%d", len(connections)+1),
					From:     comp.ID,
					To:       id,
					Protocol: "http",
					Label:    "logs",
				})
			}
		}
	}()

	finalConns := DedupeConnections(connections)
	compByName := map[string]string{}
	for _, c := range components {
		compByName[c.Name] = c.ID
	}

	setAWSCache(&AWSScanCache{
		Region:                    args.Region,
		Profile:                   args.Profile,
		AccessKeyID:               args.AccessKeyID,
		SecretAccessKey:           args.SecretAccessKey,
		SessionToken:              args.SessionToken,
		Components:                components,
		Connections:               finalConns,
		Services:                  services,
		DDBTablesByID:             ddbTablesByID,
		LambdasByID:               lambdasByID,
		ALBsByID:                  albsByID,
		TargetGroupArnByServiceID: targetGroupArnByServiceID,
		ComponentByName:           compByName,
	})

	return &village.Config{
		Name:        fmt.Sprintf("AWS live scan (%s, %d resources)", args.Region, len(components)),
		Components:  components,
		Connections: finalConns,
	}, nil
}
