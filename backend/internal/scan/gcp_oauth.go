package scan

import (
	"context"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

func oauth2HTTPClient(ctx context.Context, creds *google.Credentials) *http.Client {
	return oauth2.NewClient(ctx, creds.TokenSource)
}
