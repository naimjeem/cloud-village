package metrics

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/cloudwatch"
	cwtypes "github.com/aws/aws-sdk-go-v2/service/cloudwatch/types"
	"github.com/aws/aws-sdk-go-v2/service/ecs"

	"github.com/cloud-village/backend/internal/scan"
)

const (
	periodSec = 60
	windowSec = 300
)

func SnapshotAWS(ctx context.Context) (Snapshot, error) {
	cache := scan.GetAWSCache()
	if cache == nil {
		return emptySnapshot(), nil
	}

	opts := []func(*awsconfig.LoadOptions) error{awsconfig.WithRegion(cache.Region)}
	if cache.AccessKeyID != "" && cache.SecretAccessKey != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cache.AccessKeyID, cache.SecretAccessKey, cache.SessionToken),
		))
	} else if cache.Profile != "" {
		opts = append(opts, awsconfig.WithSharedConfigProfile(cache.Profile))
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return emptySnapshot(), fmt.Errorf("aws config: %w", err)
	}
	cw := cloudwatch.NewFromConfig(cfg)
	ecsCli := ecs.NewFromConfig(cfg)

	out := emptySnapshot()

	// 1) ECS health: group services by cluster
	byCluster := map[string][]scan.AWSService{}
	for _, s := range cache.Services {
		byCluster[s.Cluster] = append(byCluster[s.Cluster], s)
	}
	for cluster, list := range byCluster {
		arns := make([]string, 0, len(list))
		for _, l := range list {
			arns = append(arns, l.ServiceArn)
		}
		r, err := ecsCli.DescribeServices(ctx, &ecs.DescribeServicesInput{
			Cluster: aws.String(cluster), Services: arns,
		})
		if err != nil {
			log.Printf("[metrics] DescribeServices %s %v", cluster, err)
			continue
		}
		for _, svc := range r.Services {
			if svc.ServiceArn == nil {
				continue
			}
			var matched *scan.AWSService
			for i := range list {
				if list[i].ServiceArn == *svc.ServiceArn {
					matched = &list[i]
					break
				}
			}
			if matched == nil {
				continue
			}
			desired := svc.DesiredCount
			running := svc.RunningCount
			pending := svc.PendingCount
			switch {
			case desired > 0 && running == 0:
				out.Health[matched.ID] = "down"
			case running < desired || pending > 0:
				out.Health[matched.ID] = "degraded"
			default:
				out.Health[matched.ID] = "healthy"
			}
		}
	}

	// 2) Alarms in ALARM state
	if r, err := cw.DescribeAlarms(ctx, &cloudwatch.DescribeAlarmsInput{StateValue: cwtypes.StateValueAlarm}); err != nil {
		log.Printf("[metrics] DescribeAlarms %v", err)
	} else {
		for _, a := range r.MetricAlarms {
			compID := matchAlarmComponent(a, cache)
			if compID == "" {
				continue
			}
			msg := ""
			if a.AlarmDescription != nil {
				msg = *a.AlarmDescription
			} else if a.AlarmName != nil {
				msg = *a.AlarmName
			} else {
				msg = "CloudWatch alarm"
			}
			out.Alerts = append(out.Alerts, Alert{
				ComponentID: compID,
				Severity:    severityFromAlarm(a),
				Message:     msg,
			})
		}
	}

	// 3) Edge rates via RequestCountPerTarget per ECS service
	var queries []cwtypes.MetricDataQuery
	queryToService := map[string]string{}
	qi := 0
	for serviceID, tgArn := range cache.TargetGroupArnByServiceID {
		tgPart := tgArn
		if idx := strings.LastIndex(tgArn, ":"); idx >= 0 {
			tgPart = tgArn[idx+1:]
		}
		lbArn := firstALB(cache)
		if lbArn == "" {
			continue
		}
		lbPart := lbArn
		if idx := strings.Index(lbArn, "loadbalancer/"); idx >= 0 {
			lbPart = lbArn[idx+len("loadbalancer/"):]
		}
		id := fmt.Sprintf("q%d", qi)
		qi++
		queryToService[id] = serviceID
		queries = append(queries, cwtypes.MetricDataQuery{
			Id: aws.String(id),
			MetricStat: &cwtypes.MetricStat{
				Metric: &cwtypes.Metric{
					Namespace:  aws.String("AWS/ApplicationELB"),
					MetricName: aws.String("RequestCountPerTarget"),
					Dimensions: []cwtypes.Dimension{
						{Name: aws.String("TargetGroup"), Value: aws.String(tgPart)},
						{Name: aws.String("LoadBalancer"), Value: aws.String(lbPart)},
					},
				},
				Period: aws.Int32(periodSec),
				Stat:   aws.String("Sum"),
			},
			ReturnData: aws.Bool(true),
		})
	}
	if len(queries) > 0 {
		end := time.Now()
		start := end.Add(-windowSec * time.Second)
		r, err := cw.GetMetricData(ctx, &cloudwatch.GetMetricDataInput{
			MetricDataQueries: queries,
			StartTime:         aws.Time(start),
			EndTime:           aws.Time(end),
		})
		if err != nil {
			log.Printf("[metrics] GetMetricData %v", err)
		} else {
			ratePerService := map[string]float64{}
			for _, m := range r.MetricDataResults {
				if m.Id == nil {
					continue
				}
				sid, ok := queryToService[*m.Id]
				if !ok {
					continue
				}
				var total float64
				for _, v := range m.Values {
					total += v
				}
				ratePerService[sid] = total / float64(windowSec)
			}
			for _, conn := range cache.Connections {
				r1 := ratePerService[conn.From]
				r2 := ratePerService[conn.To]
				total := r1 + r2
				if total > 0 {
					out.EdgeRates[conn.ID] = total
				}
			}
		}
	}

	return out, nil
}

func severityFromAlarm(a cwtypes.MetricAlarm) string {
	name := ""
	if a.AlarmName != nil {
		name = strings.ToLower(*a.AlarmName)
	}
	desc := ""
	if a.AlarmDescription != nil {
		desc = strings.ToLower(*a.AlarmDescription)
	}
	text := name + " " + desc
	switch {
	case strings.Contains(text, "critical"),
		strings.Contains(text, "sev1"),
		strings.Contains(text, "p0"),
		strings.Contains(text, "p1"),
		strings.Contains(text, "fatal"),
		strings.Contains(text, "down"),
		strings.Contains(text, "outage"):
		return "critical"
	case strings.Contains(text, "warn"),
		strings.Contains(text, "sev3"),
		strings.Contains(text, "p3"),
		strings.Contains(text, "p4"),
		strings.Contains(text, "info"),
		strings.Contains(text, "notice"):
		return "warning"
	}
	return "warning"
}

func firstALB(cache *scan.AWSScanCache) string {
	for _, arn := range cache.ALBsByID {
		return arn
	}
	return ""
}

func matchAlarmComponent(a cwtypes.MetricAlarm, cache *scan.AWSScanCache) string {
	for _, d := range a.Dimensions {
		if d.Value == nil {
			continue
		}
		v := *d.Value
		name := ""
		if d.Name != nil {
			name = *d.Name
		}
		switch name {
		case "ServiceName":
			for _, s := range cache.Services {
				if s.ServiceName == v {
					return s.ID
				}
			}
		case "TableName":
			for id, t := range cache.DDBTablesByID {
				if t == v {
					return id
				}
			}
		case "FunctionName":
			for id, n := range cache.LambdasByID {
				if n == v {
					return id
				}
			}
		case "LoadBalancer":
			for id, arn := range cache.ALBsByID {
				if strings.Contains(arn, v) {
					return id
				}
			}
		}
		if id, ok := cache.ComponentByName[v]; ok {
			return id
		}
	}
	return ""
}
