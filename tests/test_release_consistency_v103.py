"""test_release_consistency_v103.py — v1.0.3

PURPOSE: Regression-test project-derived Linux x64 package versions and
pre-release candidate validation. Cases include mislabeled 1.2.1 archives.
REQUIREMENTS: Python 3.10+, standard library. No external services, writes only
inside TemporaryDirectory. Never touches Jellyfin or GitHub.
USAGE: python3 -m unittest discover -s tests -p 'test_release_consistency_v103.py' -v
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import os
import shutil
import subprocess
import sys
import textwrap
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DLL = 'Jellyfin.Plugin.ComposerSharedMetadata.dll'
GUID = '4c65902b-e89d-4549-a313-2a204c622e77'


def fake_archive(dest: Path, version: str):
    """Build a non-installable test ZIP. Only metadata is meaningful."""
    with zipfile.ZipFile(dest, 'w') as z:
        z.writestr('meta.json', json.dumps({'name': 'Composer Shared Metadata',
                    'guid': GUID, 'version': version+'.0', 'targetAbi': '12.2.0.0'}))
        z.writestr(DLL, b'fake test DLL')


class PackageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for relative in ('tools/select_composer_build.py', 'packaging/package_release.py'):
            dest = self.root/relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT/relative, dest)
        self.proj = self.root/'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj'
        self.proj.parent.mkdir(parents=True, exist_ok=True)
        self.pub = self.root/'out/linux-x64'
        self.pub.mkdir(parents=True, exist_ok=True)
        for name in (DLL, 'Microsoft.Data.Sqlite.dll', 'SQLitePCLRaw.core.dll', 'SQLitePCLRaw.provider.e_sqlite3.dll', 'SQLitePCLRaw.batteries_v2.dll', 'libe_sqlite3.so'):
            (self.pub/name).write_bytes(b'fake binaries for packaging test')

    def run_packager(self, *args):
        return subprocess.run([sys.executable, str(self.root/'packaging/package_release.py'),
            '--publish-dir', str(self.pub), '--rid', 'linux-x64',
            '--output-dir', str(self.root/'dist'), *args],
            cwd=self.root, capture_output=True, text=True)

    def declare(self, version):
        self.proj.write_text('<Project><PropertyGroup><Version>'+version+'</Version>'
            '<AssemblyVersion>'+version+'.0</AssemblyVersion></PropertyGroup></Project>')

    def test_output_zip_meta_matches_project(self):
        self.declare('1.2.2')
        result = self.run_packager('--expected-version','1.2.2','--apply')
        self.assertEqual(result.returncode,0,result.stderr)
        archive=self.root/'dist/jellyfin-composer-shared-metadata-1.2.2-linux-x64-install.zip'
        with zipfile.ZipFile(archive) as z:
            self.assertEqual(json.loads(z.read('meta.json'))['version'], '1.2.2.0')
            self.assertIn(DLL,z.namelist())
        self.assertFalse((self.root/'dist/jellyfin-composer-shared-metadata-1.2.1-linux-x64-install.zip').exists())

    def test_changes_follow_project_next_version(self):
        self.declare('1.2.3')
        result = self.run_packager('--apply')
        self.assertEqual(result.returncode,0,result.stderr)
        with zipfile.ZipFile(self.root/'dist/jellyfin-composer-shared-metadata-1.2.3-linux-x64-install.zip') as z:
            self.assertEqual(json.loads(z.read('meta.json'))['version'], '1.2.3.0')

    def test_expected_version_mismatch_blocks_package(self):
        self.declare('1.2.1')
        result = self.run_packager('--expected-version','1.2.2','--apply')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Plugin version mismatch',result.stderr)
        self.assertFalse((self.root/'dist').exists())

    def test_dry_run_creates_no_archive(self):
        self.declare('1.2.2')
        result = self.run_packager()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('DRY RUN',result.stdout)
        self.assertFalse((self.root/'dist').exists())


class WorkflowContractTest(unittest.TestCase):
    def test_build_validates_archive_before_artifact_upload(self):
        t=(ROOT/'.github/workflows/build-and-package.yml').read_text()
        self.assertIn('steps.version.outputs.EXPECTED_ARTIFACT',t)
        self.assertIn('--expected-version "${{ steps.version.outputs.EXPECTED_VERSION }}"',t)
        self.assertLess(t.index('Validate compiled ZIP version before'),t.index('Upload built install ZIPs'))
        self.assertNotIn('name: jellyfin-composer-plugin-1.2.2',t)

    def test_publisher_checks_each_candidate_before_selection(self):
        t=(ROOT/'.github/workflows/publish-composer-manifest.yml').read_text()
        self.assertLess(t.index('if ! python3 tools/prepare_x64_release.py'), t.index('SELECTED_RUN="$RUN_ID"'))
        self.assertIn('Skipping run $RUN_ID: ZIP meta.json',t)
        self.assertLess(t.index('SELECTED_RUN="$RUN_ID"'),t.index('Create or verify public GitHub Release asset'))


class MockGitHubSelectionTest(unittest.TestCase):
    @staticmethod
    def fetch_shell():
        t=(ROOT/'.github/workflows/publish-composer-manifest.yml').read_text()
        snippet=t.split('      - name: Find and download matching successful build artifact\n',1)[1]
        snippet=snippet.split('\n      - name:',1)[0]
        return textwrap.dedent(snippet.split('        run: |\n',1)[1])

    def setUp(self):
        self.tmp=TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.work=Path(self.tmp.name)
        (self.work/'bin').mkdir()
        (self.work/'tools').mkdir()
        for name in ('prepare_x64_release.py','make_plugin_manifest.py'):
            shutil.copy2(ROOT/'tools'/name,self.work/'tools'/name)
        mock=r'''#!/usr/bin/env python3
import os,sys,pathlib,json,zipfile
args=sys.argv[1:]
scenario=os.environ['MOCK_SCENARIO']
if args[:2]==['run','list']:
    print('1003\n1002' if scenario=='bad-then-good' else '1003')
elif args[:2]==['run','view']:
    print('success')
elif args[0]=='api':
    print('jellyfin-composer-plugin-1.2.2')
elif args[:2]==['run','download']:
    rid=int(args[2]); d=pathlib.Path(args[args.index('--dir')+1]);d.mkdir(parents=True,exist_ok=True)
    version='1.2.2' if rid==1002 else '1.2.1'
    name='jellyfin-composer-shared-metadata-'+version+'-linux-x64-install.zip'
    with zipfile.ZipFile(d/name,'w') as z:
        z.writestr('meta.json',json.dumps({'guid':'4c65902b-e89d-4549-a313-2a204c622e77','version':version+'.0','targetAbi':'12.2.0.0'}))
        z.writestr('Jellyfin.Plugin.ComposerSharedMetadata.dll',b'fake dll')
else:
    print('unsupported command',args,file=sys.stderr);sys.exit(2)
'''
        p=self.work/'bin/gh';p.write_text(mock);p.chmod(0o755)

    def mock_selection(self,scenario,explicit=''):
        env=os.environ.copy()
        env.update({'PATH':str(self.work/'bin')+':'+env['PATH'],
          'MOCK_SCENARIO':scenario,'GH_TOKEN':'fake','REPO':'designworld-ca/Composer_Metadata',
          'INPUT_RUN_ID':explicit,'EXPECTED_ARTIFACT':'jellyfin-composer-plugin-1.2.2',
          'EXPECTED_TAG':'v1.2.2','GITHUB_OUTPUT':str(self.work/'out')})
        return subprocess.run(['bash','-e'],input=self.fetch_shell(),cwd=self.work,
           env=env,capture_output=True,text=True)

    def test_wrong_version_automatic_selection_rejected(self):
        r=self.mock_selection('only-bad')
        self.assertNotEqual(r.returncode,0)
        self.assertIn('No VALID successful build',r.stderr)
        self.assertFalse((self.work/'out').exists())

    def test_wrong_version_skipped_and_valid_build_selected(self):
        r=self.mock_selection('bad-then-good')
        self.assertEqual(r.returncode,0,r.stdout+'\n'+r.stderr)
        self.assertIn('Skipping run 1003',r.stdout)
        self.assertIn('build_run_id=1002',(self.work/'out').read_text())

    def test_bad_explicit_run_rejected(self):
        r=self.mock_selection('bad-then-good','1003')
        self.assertNotEqual(r.returncode,0)
        self.assertFalse((self.work/'out').exists())


if __name__=='__main__':
    unittest.main()
