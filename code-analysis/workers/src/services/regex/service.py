import os
import shutil
import tempfile
import asyncio
from src.services.base import EnginePublisher
from src.infrastructure.storage import download_codebase
from src.infrastructure.rules_repo import compile_rules, load_custom_rules, matches_extension
from src.infrastructure.sensitive_data import run_sensitive_data_scan
from src.infrastructure.scan_skip import (
    MAX_SOURCE_FILE_BYTES,
    is_generated_asset_name,
    is_scan_skipped_dir_name,
    is_scan_skipped_relative_path,
    looks_minified,
)

class RegexService(EnginePublisher):
    engine_name = "regex"

    def run_scan(self, repo_path: str, rules: list, scan_sensitive: bool = True) -> list:
        findings = []
        # Collected during the same walk: reading the tree twice for two
        # pattern scanners is wasted IO on large repos.
        collected = []

        for root, dirs, files in os.walk(repo_path):
            # Prune in place so os.walk never descends into node_modules, vendor,
            # dist and friends. The previous check was `".git" in file_path`, a
            # substring match that also excluded .gitignore while letting every
            # other dependency directory through.
            dirs[:] = [d for d in dirs if not is_scan_skipped_dir_name(d)]

            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, repo_path)

                if is_scan_skipped_relative_path(rel_path):
                    continue
                # Published vendor bundles live in ordinary directories such as
                # public/, so name-based detection is needed on top of pruning.
                if is_generated_asset_name(file):
                    continue

                try:
                    if os.path.getsize(file_path) > MAX_SOURCE_FILE_BYTES:
                        continue

                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()

                    # Catches minified assets that carry no .min in the name. A
                    # finding on line 2 of a 400 KB line is unusable anyway.
                    if looks_minified(content):
                        continue

                    if scan_sensitive:
                        collected.append((rel_path, content))

                    applicable = [r for r in rules if matches_extension(rel_path, r[4])]
                    if not applicable:
                        continue

                    for line_num, line in enumerate(content.splitlines(), 1):
                        for rule_id, pattern, message, severity, _ext in applicable:
                            if pattern.search(line):
                                findings.append({
                                    "rule_id": rule_id,
                                    "severity": severity,
                                    "message": message,
                                    "file_path": rel_path,
                                    "line": line_num,
                                    "end_line": line_num,
                                    "snippet": line.strip(),
                                })
                except UnicodeDecodeError:
                    pass  # Skip binary files
                except OSError as e:
                    print(f"[RegexService] Error reading {rel_path}: {e}")

        if scan_sensitive:
            findings.extend(run_sensitive_data_scan(collected))

        return findings

    async def process_job(self, message: dict):
        uri = message.get("uri")
        job_id = message.get("job_id")
        scan_id = message.get("scan_id")
        
        print(f"[*] RegexService: Processing {job_id} from {uri}")
        scratch_dir = tempfile.mkdtemp()
        
        try:
            options = message.get("options") or {}
            if options.get("enable_custom_rules") is False:
                print(f"[*] RegexService: custom rules disabled for {job_id}, skipping")
                rules = []
            else:
                # Source of truth is the database (decision §7.4). An empty
                # system set means seedCustomRules() has never run; say so
                # loudly rather than reporting a clean scan.
                raw_rules = await load_custom_rules(message.get("tenant_id"))
                if not raw_rules:
                    print("[!] RegexService: no custom rules found in the database "
                          "(has the backend's seedCustomRules() run?)")
                rules = compile_rules(raw_rules)

            scan_sensitive = options.get("enable_sensitive_data") is not False

            await asyncio.to_thread(download_codebase, uri, scratch_dir)
            findings = await asyncio.to_thread(self.run_scan, scratch_dir, rules, scan_sensitive)
            
            await self._publish(job_id, scan_id, findings, "ok")
            print(f"[*] RegexService: Finished {job_id} with {len(findings)} findings.")
            
        except Exception as e:
            print(f"[!] RegexService Error on {job_id}: {e}")
            # Publish so the aggregator barrier still clears, but mark the
            # engine failed so an empty result is never read as "clean".
            await self._publish(job_id, scan_id, [], "failed", str(e))
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)
