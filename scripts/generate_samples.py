"""Render the browser's synthetic registry fixtures as downloadable PDF and PNG files."""

import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from fontTools.ttLib import TTFont as FontSource
from fontTools.varLib.instancer import instantiateVariableFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'web' / 'samples'
FONT = Path(os.environ.get('SAMPLE_KOREAN_FONT', r'C:\Windows\Fonts\NotoSansKR-VF.ttf'))
KST = timezone(timedelta(hours=9))


def pdf_for(sample, target, path):
    width, height = A4
    page = Canvas(str(path), pagesize=A4, invariant=1, pageCompression=1)
    page.setTitle(f"등기로 검증용 - {sample['name']}")
    page.setAuthor('등기로 MVP')
    navy = HexColor('#041730')
    blue = HexColor('#0B65A5')
    muted = HexColor('#506277')
    line = HexColor('#DBE4EC')
    light = HexColor('#EAF4FB')

    def text(value, x, y, size=11, color=navy):
        page.setFillColor(color)
        page.setFont('SampleKorean', size)
        page.drawString(x, y, value)

    def section(label, rows, top):
        page.setFillColor(light)
        page.rect(48, top - 30, width - 96, 30, fill=1, stroke=0)
        text(label, 62, top - 19, 11, blue)
        y = top - 30
        for field, value in rows:
            text(field, 62, y - 23, 10, muted)
            text(value, 192, y - 23, 11)
            page.setStrokeColor(line)
            page.line(48, y - 36, width - 48, y - 36)
            y -= 36
        return y - 23

    page.setFillColor(navy)
    page.rect(0, height - 126, width, 126, fill=1, stroke=0)
    text('등기로 MVP / 검증용 가상 문서', 48, height - 45, 12, white)
    text('등기사항증명서 예시', 48, height - 86, 27, white)
    text(sample['name'], 48, height - 154, 14, blue)
    text('이 문서의 부동산과 권리 정보는 서비스 테스트를 위해 만든 가상 자료입니다.', 48, height - 178, 10, muted)

    target_type = target['type'] if target else '미확인'
    target_label = ' '.join(value for value in (target['building'], target.get('unit')) if value) if target else '식별 불가 사례'
    issued_at = sample.get('issuedAt')
    issued_label = datetime.fromisoformat(issued_at).astimezone(KST).strftime('%Y-%m-%d %H:%M (KST)') if issued_at else '미확인'
    y = section('표제부 / 등기 대상', [
        ('부동산 유형', target_type), ('대상 표시', target_label),
        ('검증 식별번호', sample['targetId'] or '미확인'), ('발급 기준 시각', issued_label),
    ], height - 202)
    y = section('갑구 / 소유권에 관한 사항', [('소유권 명의', sample.get('owner', '검수 필요'))], y)
    amount = sample.get('amount')
    y = section('을구 / 소유권 외 권리', [('근저당권 채권최고액', f'{amount:,}원' if amount is not None else '표시 항목 없음')], y)
    if sample.get('requiresReview'):
        text('이 샘플은 게시 전 검수 보류 동작을 확인하는 데 사용합니다.', 48, y - 3, 10, blue)
    page.setStrokeColor(line)
    page.line(48, 72, width - 48, 72)
    text('검증용 가상 문서 / 증명 효력 없음', 48, 53, 9, muted)
    text('1 / 1', width - 71, 53, 9, muted)
    page.showPage()
    page.save()


def main():
    result = subprocess.run([
        'node', '--input-type=module', '-e',
        "import {samples, targets} from './web/fixtures.js'; console.log(JSON.stringify({samples, targets}));",
    ], cwd=ROOT, check=True, capture_output=True, encoding='utf-8')
    fixtures = json.loads(result.stdout)
    targets = {target['id']: target for target in fixtures['targets']}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='deunggiro-samples-') as temporary:
        font_path = FONT
        with FontSource(FONT) as font:
            if 'fvar' in font and any(axis.axisTag == 'wght' for axis in font['fvar'].axes):
                font_path = Path(temporary) / 'sample-korean.ttf'
                instantiateVariableFont(font, {'wght': 500}, inplace=True).save(font_path)
        pdfmetrics.registerFont(TTFont('SampleKorean', str(font_path)))
        for sample in fixtures['samples']:
            target = targets.get(sample['targetId'])
            if sample['format'] == 'PDF':
                pdf_for(sample, target, OUTPUT / f"{sample['id']}.pdf")
                continue
            temporary_pdf = Path(temporary) / f"{sample['id']}.pdf"
            pdf_for(sample, target, temporary_pdf)
            subprocess.run([
                'pdftoppm', '-r', '105', '-png', '-singlefile',
                str(temporary_pdf), str(OUTPUT / sample['id']),
            ], check=True)


if __name__ == '__main__':
    main()
