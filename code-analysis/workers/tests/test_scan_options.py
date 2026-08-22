"""ScanOptions accepts camelCase keys from the TypeScript backend queue payload."""

from src.models.schemas import ScanOptions


def test_scan_options_accepts_camel_case_from_backend():
    opts = ScanOptions.model_validate({
        "enableSemgrep": False,
        "enableBearer": True,
        "enableCustomRules": True,
        "enableSensitiveData": False,
        "enableCodeql": False,
    })
    assert opts.enable_semgrep is False
    assert opts.enable_bearer is True
    assert opts.enable_custom_rules is True
    assert opts.enable_sensitive_data is False
    assert opts.enable_codeql is False


def test_scan_options_accepts_legacy_sonarqube_toggle():
    opts = ScanOptions.model_validate({"enableSonarqube": False})
    assert opts.enable_bearer is False


def test_scan_options_defaults_when_empty():
    opts = ScanOptions.model_validate({})
    assert opts.enable_semgrep is False
    assert opts.enable_bearer is True
    assert opts.enable_codeql is True
