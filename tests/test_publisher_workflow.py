"""test_publisher_workflow.py — v1.0.2

Static regression checks for version-safe GitHub release publication.
Offline/read-only: does not require GitHub CLI, credentials, or Jellyfin server.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/publish-composer-manifest.yml'


class PublisherWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = WORKFLOW.read_text(encoding='utf-8')

    def test_project_version_required(self):
        self.assertIn('tools/select_composer_build.py', self.source)
        self.assertIn('plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj', self.source)
        self.assertIn('steps.expected.outputs.EXPECTED_TAG', self.source)

    def test_artifact_name_exactly_matches_current_version(self):
        self.assertIn('steps.expected.outputs.EXPECTED_ARTIFACT', self.source)
        self.assertIn('grep -Fx "$EXPECTED_ARTIFACT"', self.source)
        self.assertIn('--name "$EXPECTED_ARTIFACT"', self.source)

    def test_no_latest_successful_run_without_version_check(self):
        self.assertNotIn('--limit 1 --json databaseId', self.source)
        self.assertIn('for RUN_ID in "${RUNS[@]}"', self.source)
        self.assertIn('No successful build with artifact $EXPECTED_ARTIFACT was found.', self.source)

    def test_zip_version_must_match_project(self):
        self.assertIn('tools/prepare_x64_release.py', self.source)
        self.assertIn('--release-tag "$EXPECTED_TAG"', self.source)

    def test_release_asset_remains_immutable(self):
        self.assertIn('refusing to overwrite it.', self.source)
        self.assertIn('DOWNLOADED_SHA', self.source)
        self.assertNotIn('--clobber', self.source)

    def test_only_linux_x64(self):
        self.assertIn('-linux-x64-install.zip', self.source)
        self.assertNotIn('linux-arm64-install.zip', self.source)


if __name__ == '__main__':
    unittest.main()
