"""ScanOptions accepts camelCase keys from the TypeScript backend queue payload."""

from src.models.schemas import ScanOptions


def test_scan_options_accepts_camel_case_from_backend():
    opts = ScanOptions.model_validate({
        "enableSemgrep": False,
        "enableCustomRules": True,
        "enableSensitiveData": False,
    })
    assert opts.enable_semgrep is False
    assert opts.enable_custom_rules is True
    assert opts.enable_sensitive_data is False


def test_unknown_toggles_are_ignored_not_rejected():
    """The backend still sends enableSonarqube; this pipeline has no such engine.

    Ignoring it keeps a queue payload from a newer backend parseable here, which
    rejecting would turn into a dead job rather than a skipped engine.
    """
    opts = ScanOptions.model_validate({"enableSonarqube": True, "enableCodeql": True})
    assert not hasattr(opts, "enable_sonarqube")
    assert opts.enable_custom_rules is True


def test_scan_options_defaults_when_empty():
    opts = ScanOptions.model_validate({})
    assert opts.enable_semgrep is False
    assert opts.enable_custom_rules is True
    assert opts.enable_sensitive_data is True
