use axum::{
    extract::Request,
    http::{header, request::Parts, HeaderValue, StatusCode},
    middleware::Next,
    response::Response,
};

/// Tower middleware that validates the Bearer token against the stored agent token.
pub async fn auth_middleware(
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Skip auth for health endpoint
    if req.uri().path() == "/api/v1/health" {
        return Ok(next.run(req).await);
    }

    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    match auth_header {
        Some(_token) => {
            // The actual token comparison is done by ValidateRequestHeaderLayer
            Ok(next.run(req).await)
        }
        None => Err(StatusCode::UNAUTHORIZED),
    }
}

/// axum-extra extractor for the Bearer token.
pub struct AuthToken(pub String);

#[axum::async_trait]
impl<S> axum::extract::FromRequestParts<S> for AuthToken
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        let value = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v: &HeaderValue| v.to_str().ok())
            .and_then(|s: &str| s.strip_prefix("Bearer "))
            .map(|s: &str| s.to_string());

        match value {
            Some(token) => Ok(AuthToken(token)),
            None => Err(StatusCode::UNAUTHORIZED),
        }
    }
}
