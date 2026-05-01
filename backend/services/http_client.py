"""HTTPX client helpers with optional weak TLS support."""

import ssl

import httpx


def _build_weak_tls_context() -> ssl.SSLContext:
    """Create an SSL context that allows weaker DH parameters."""
    context = ssl.create_default_context()
    context.set_ciphers("DEFAULT:@SECLEVEL=1")
    return context


def create_async_client(timeout_s: float, allow_weak_tls: bool) -> httpx.AsyncClient:
    """Create an AsyncClient configured for optional weak TLS."""
    verify = True
    if allow_weak_tls:
        verify = _build_weak_tls_context()
    return httpx.AsyncClient(timeout=timeout_s, verify=verify)
