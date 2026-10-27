"""Native smoke checks through Android UI Automator/ADB; does not start image generation.

Run from backend with an installed preview APK and running emulator:
.venv/Scripts/python scripts/android_smoke.py --adb E:/Android/Sdk/platform-tools/adb.exe
"""
import argparse
import json
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings

PACKAGE = 'vn.shopfit.studio'


class Device:
    def __init__(self, adb, serial, artifacts):
        self.adb, self.serial, self.artifacts = adb, serial, artifacts
        size = self.run('shell', 'wm', 'size')
        self.width, self.height = map(int, re.findall(r'(\d+)x(\d+)', size)[-1])

    def run(self, *args):
        return subprocess.run([self.adb, '-s', self.serial, *args], capture_output=True, check=True, timeout=35).stdout.decode('utf-8', errors='replace')

    def tree(self):
        self.run('shell', 'uiautomator', 'dump', '/sdcard/shopfit-ui.xml')
        return ET.fromstring(self.run('shell', 'cat', '/sdcard/shopfit-ui.xml'))

    def node(self, text, edit=False):
        for node in self.tree().iter('node'):
            if edit and node.get('class') != 'android.widget.EditText':
                continue
            if node.get('text') == text or node.get('content-desc') == text:
                return node
        return None

    def find(self, text, scroll=False, edit=False):
        for _ in range(9 if scroll else 1):
            node = self.node(text, edit)
            if node is not None:
                return node
            if scroll:
                self.run('shell', 'input', 'swipe', str(self.width//2), str(int(self.height*.78)), str(self.width//2), str(int(self.height*.3)), '350')
        raise RuntimeError(f'Native control not found: {text}')

    def tap(self, text, scroll=False):
        node = self.find(text, scroll)
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
        self.run('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))

    def fill(self, label, value):
        node = self.find(label, scroll=True, edit=True)
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
        self.run('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
        self.run('shell', 'input', 'keyevent', '123')
        self.run('shell', 'input', 'keyevent', *(['67'] * 8))
        self.run('shell', 'input', 'text', value)
        self.run('shell', 'input', 'keyevent', '4')

    def expect(self, text):
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if self.node(text) is not None:
                return
            time.sleep(.5)
        raise RuntimeError(f'Native screen did not show: {text}')

    def screenshot(self, name):
        self.run('shell', 'screencap', '-p', '/sdcard/shopfit-screen.png')
        self.run('pull', '/sdcard/shopfit-screen.png', str(self.artifacts / name))

    def open(self, route=''):
        if route:
            self.run('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', f'shopfit://{route}', '-p', PACKAGE)
        else:
            self.run('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--adb', required=True)
    parser.add_argument('--serial', default='emulator-5554')
    args = parser.parse_args()
    artifacts = Path(__file__).resolve().parents[2] / 'artifacts'
    device = Device(args.adb, args.serial, artifacts)
    report = {'device': args.serial, 'package': PACKAGE, 'checks': [], 'paid_image_calls': 0}
    settings = Settings()
    with httpx.Client(base_url='http://localhost:8000', timeout=30) as api:
        response = api.post('/api/auth/login', json={'email': 'khach@shopfit.local', 'password': settings.customer_password})
        response.raise_for_status()
        api.headers['Authorization'] = 'Bearer ' + response.json()['token']
        previous = api.get('/api/body-profile').json()['profile']
        try:
            device.open()
            device.expect('Sơ mi Linen Essential')
            device.screenshot('android-catalog.png')
            report['checks'].append('native_catalog')
            device.open('profile')
            device.expect('Góc nhỏ của bạn')
            device.tap('Đăng nhập / Đăng ký')
            device.tap('Khách hàng', scroll=True)
            device.expect('khach@shopfit.local')
            report['checks'].append('native_demo_login')
            device.open('body-profile')
            device.expect('Hồ sơ cơ thể')
            for label, value in [('Chiều cao (cm) *', '175'), ('Cân nặng (kg) *', '70'), ('Vòng ngực (cm)', '94')]:
                device.fill(label, value)
            device.tap('Lưu hồ sơ cơ thể', scroll=True)
            saved = api.get('/api/body-profile').json()['profile']
            assert saved['chest_cm'] == 94 and saved['height_cm'] == 175
            report['checks'].append('native_body_form_saved')
            device.open('product/linen-shirt')
            device.tap('Size L', scroll=True)
            device.find('Bản đồ độ vừa · Size L', scroll=True)
            device.screenshot('android-fit-map.png')
            report['checks'].append('native_size_map')
            device.open('try-on')
            device.tap('Xem lần thử Áo thun Everyday', scroll=True)
            device.expect('Góc trước')
            device.screenshot('android-four-view-front.png')
            for label in ('Góc trái', 'Góc sau', 'Góc phải'):
                device.tap('Góc tiếp theo')
                device.expect(label)
            device.screenshot('android-four-view-right.png')
            report['checks'].append('native_four_view_arrows')
            device.run('shell', 'am', 'force-stop', PACKAGE)
            device.open('profile')
            device.expect('khach@shopfit.local')
            report['checks'].append('securestore_session_after_restart')
            device.open('connection')
            device.expect('Địa chỉ backend ShopFit')
            device.screenshot('android-connection.png')
            report['checks'].append('native_connection_form')
            report['status'] = 'passed'
        except Exception as exc:
            report['status'] = 'failed'
            report['error'] = str(exc)
            device.screenshot('android-smoke-failure.png')
            raise
        finally:
            if previous:
                api.patch('/api/body-profile', json=previous).raise_for_status()
            else:
                api.delete('/api/body-profile').raise_for_status()
            (artifacts / 'android-smoke.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps(report, ensure_ascii=True), flush=True)


if __name__ == '__main__':
    main()
