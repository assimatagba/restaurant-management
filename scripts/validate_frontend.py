"""Check the deployable Vite output, including local assets and lazy modules."""
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit


class EntryAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'):
            self.assets.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') in ('stylesheet', 'modulepreload', 'manifest'):
            self.assets.append(attrs.get('href', ''))


def validate(directory: Path):
    manifest = json.loads((directory / '.vite/manifest.json').read_text(encoding='utf-8'))
    if not any(item.get('isDynamicEntry') for item in manifest.values()):
        raise ValueError('Build must contain dynamically loaded application chunks')
    for relative in ('index.html', 'back-office/index.html', 'front-office/index.html'):
        page = directory / relative
        parser = EntryAssets()
        parser.feed(page.read_text(encoding='utf-8'))
        if not parser.assets:
            raise ValueError(f'No runtime assets found in {relative}')
        for asset in parser.assets:
            url = urlsplit(asset)
            if url.netloc:
                raise ValueError(f'Page entry depends on an external asset: {asset}')
            target = directory / unquote(url.path.lstrip('/')) if url.path.startswith('/') else page.parent / unquote(url.path)
            if not target.is_file():
                raise ValueError(f'Missing build asset in {relative}: {asset}')
    if not list((directory / 'assets').glob('*.woff2')):
        raise ValueError('Local WOFF2 fonts are missing from the production build')
    for css in (directory / 'assets').glob('*.css'):
        if 'fonts.googleapis.com' in css.read_text(encoding='utf-8'):
            raise ValueError('Production CSS still depends on Google Fonts')
    return {'pages': 3, 'dynamic_chunks': sum(bool(item.get('isDynamicEntry')) for item in manifest.values()),
            'local_fonts': len(list((directory / 'assets').glob('*.woff2')))}


if __name__ == '__main__':
    print(json.dumps(validate(Path(__file__).resolve().parents[1] / 'frontend/dist'), indent=2))
