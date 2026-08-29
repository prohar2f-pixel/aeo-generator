#!/usr/bin/env python3
import base64
import grp
import json
import os
import pathlib
import re
import subprocess
import tempfile
import urllib.parse

SUBSCRIPTION_FILE = pathlib.Path('/etc/xray/subscription-url')
CONFIG_FILE = pathlib.Path('/etc/xray/config.json')
MAX_SUBSCRIPTION_BYTES = 5_000_000


def fail(message):
    raise SystemExit(message)


def read_subscription_url():
    if not SUBSCRIPTION_FILE.is_file() or SUBSCRIPTION_FILE.stat().st_mode & 0o077:
        fail('subscription_file_missing_or_unsafe')
    url = SUBSCRIPTION_FILE.read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'https://silvester\.men/[A-Za-z0-9_-]{12,}', url):
        fail('invalid_subscription_url')
    return url


def fetch_links(url):
    result = subprocess.run(
        ['curl', '-fsSL', '--max-time', '20', '--connect-timeout', '10', url],
        check=True,
        capture_output=True,
    )
    if len(result.stdout) > MAX_SUBSCRIPTION_BYTES:
        fail('subscription_too_large')
    compact = re.sub(rb'\s+', b'', result.stdout)
    try:
        decoded = base64.b64decode(compact + b'=' * (-len(compact) % 4), validate=True)
    except Exception:
        fail('invalid_subscription_encoding')
    links = re.findall(r'vless://[^\s"\']+', decoded.decode('utf-8'))
    if not links:
        fail('no_vless_profiles')
    return links


def build_config(link):
    parsed = urllib.parse.urlsplit(link)
    query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    if parsed.scheme != 'vless' or not parsed.hostname or parsed.port != 443 or not parsed.username:
        fail('invalid_vless_profile')
    if query.get('security') != ['reality'] or query.get('type', ['tcp']) != ['tcp']:
        fail('unsupported_vless_transport')
    for required in ('sni', 'pbk'):
        if not query.get(required, [''])[0]:
            fail(f'missing_vless_{required}')

    user = {
        'id': urllib.parse.unquote(parsed.username),
        'encryption': query.get('encryption', ['none'])[0] or 'none',
    }
    flow = query.get('flow', [''])[0]
    if flow:
        user['flow'] = flow
    reality = {
        'serverName': query['sni'][0],
        'fingerprint': query.get('fp', ['chrome'])[0],
        'publicKey': query['pbk'][0],
        'show': False,
    }
    short_id = query.get('sid', [''])[0]
    if short_id:
        reality['shortId'] = short_id

    return {
        'log': {'loglevel': 'warning'},
        'inbounds': [{
            'tag': 'analyzer-http-proxy',
            'listen': '127.0.0.1',
            'port': 10809,
            'protocol': 'http',
            'settings': {},
        }],
        'outbounds': [{
            'tag': 'lagom',
            'protocol': 'vless',
            'settings': {'vnext': [{
                'address': parsed.hostname,
                'port': parsed.port,
                'users': [user],
            }]},
            'streamSettings': {
                'network': 'tcp',
                'security': 'reality',
                'realitySettings': reality,
            },
        }],
    }


def write_config(config):
    CONFIG_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix='config.', suffix='.json', dir=CONFIG_FILE.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(config, handle, separators=(',', ':'))
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.chown(temporary_name, 0, grp.getgrnam('xray').gr_gid)
        os.chmod(temporary_name, 0o640)
        subprocess.run(['/usr/local/bin/xray', 'run', '-test', '-config', temporary_name], check=True)
        os.replace(temporary_name, CONFIG_FILE)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


write_config(build_config(fetch_links(read_subscription_url())[0]))
print('xray_config_refreshed')
