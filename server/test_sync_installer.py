"""Exercise the installer's real embedded configuration generator on safe fixtures."""
import re
import tempfile
import unittest
from pathlib import Path


class SyncInstallerTest(unittest.TestCase):
    def test_generated_nginx_routes_are_clean_and_existing_routes_survive(self):
        installer = (Path(__file__).parent.parent / 'scripts' / 'install-sync.sh').read_text(encoding='utf-8')
        generator = installer.split("python3 - <<'PY'\n", 1)[1].split('\nPY\n', 1)[0]
        existing = '''    location = /api/learning-sync {
        proxy_pass http://127.0.0.1:3197;
        access_log off;
    }
'''
        for prior in ('', existing):
            with self.subTest(existing_sync=bool(prior)), tempfile.TemporaryDirectory() as tmp:
                config = Path(tmp) / 'site.conf'
                backups = Path(tmp) / 'backups'
                backups.mkdir()
                original = 'server {\n' + prior + '    location / {\n        try_files $uri /index.html;\n    }\n}\n'
                config.write_text(original, encoding='utf-8')
                code = generator.replace("Path('/etc/nginx/sites-available/cet-listening')", 'Path(' + repr(str(config)) + ')')
                code = code.replace('/var/backups/listening-sync/', str(backups).replace('\\', '/') + '/')
                exec(compile(code, 'installer-nginx-generator', 'exec'), {})
                generated = config.read_text(encoding='utf-8')
                self.assertNotIn("'", generated)
                self.assertEqual(generated.count('location = /api/learning-sync {'), 1)
                self.assertEqual(generated.count('location ^~ /api/jiufen/ {'), 1)
                self.assertEqual(generated.count('location ^~ /assets/jiufen/ {'), 1)
                self.assertEqual(generated.count('{'), generated.count('}'))
                self.assertRegex(generated, r'(?m)^    location \^~ /api/jiufen/ \{$')
                route = re.search(r'location \^~ /api/jiufen/ \{(.*?)\n    \}', generated, re.S).group(1)
                for directive in ('proxy_set_header X-Listening-Client-IP $remote_addr;', 'proxy_pass http://127.0.0.1:3197;', 'access_log off;', 'limit_except POST { deny all; }'):
                    self.assertIn(directive, route)
                static_route = re.search(r'location \^~ /assets/jiufen/ \{(.*?)\n    \}', generated, re.S).group(1)
                self.assertIn('types { text/javascript mjs; }', static_route)
                self.assertIn('try_files $uri =404;', static_route)
                if prior:
                    self.assertIn(existing, generated)
                self.assertIn('try_files $uri /index.html;', generated)
                exec(compile(code, 'installer-nginx-generator', 'exec'), {})
                self.assertEqual(config.read_text(encoding='utf-8'), generated)
