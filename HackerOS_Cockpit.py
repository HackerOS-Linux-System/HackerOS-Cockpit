from flask import Flask, render_template, request, jsonify, send_file
import psutil
import subprocess
import os
import logging
import pwd
import grp
import requests
from datetime import datetime
from bs4 import BeautifulSoup
import feedparser
import socket
import re
import io
import cachetools
from functools import lru_cache
from urllib.parse import quote

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Cache for news
news_cache = cachetools.TTLCache(maxsize=100, ttl=3600)

# Validate inputs
def validate_input(text, max_length=100, allowed_chars=r'^[\w\.\-]+$'):
    return bool(re.match(allowed_chars, text)) and len(text) <= max_length

# Helper functions
@lru_cache(maxsize=1)
def get_system_info():
    try:
        cpu_freq = psutil.cpu_freq()
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        net = psutil.net_io_counters()
        processes = [{'pid': p.pid, 'name': p.info['name'], 'cpu': p.info['cpu_percent'], 'memory': p.info['memory_percent']}
                     for p in psutil.process_iter(['name', 'cpu_percent', 'memory_percent'])]
        return {
            'cpu_usage': psutil.cpu_percent(interval=1),
            'cpu_freq': cpu_freq.current if cpu_freq else 'N/A',
            'memory_total': memory.total / (1024**3),
            'memory_used': memory.used / (1024**3),
            'disk_total': disk.total / (1024**3),
            'disk_used': disk.used / (1024**3),
            'net_sent': net.bytes_sent / (1024**2),
            'net_recv': net.bytes_recv / (1024**2),
            'uptime': str(datetime.now() - datetime.fromtimestamp(psutil.boot_time())).split('.')[0],
            'processes': processes[:10]
        }
    except Exception as e:
        logging.error(f"System info error: {e}")
        return {}

def get_service_status(service_name):
    if not validate_input(service_name):
        return False
    try:
        result = subprocess.run(['systemctl', 'is-active', service_name], capture_output=True, text=True)
        return result.stdout.strip() == 'active'
    except subprocess.CalledProcessError:
        return False

def get_users():
    try:
        return [{'username': u.pw_name, 'uid': u.pw_uid, 'home': u.pw_dir} for u in pwd.getpwall()]
    except Exception as e:
        logging.error(f"Users error: {e}")
        return []

def get_groups():
    try:
        return [{'groupname': g.gr_name, 'gid': g.gr_gid} for g in grp.getgrall()]
    except Exception as e:
        logging.error(f"Groups error: {e}")
        return []

def run_nmap(target):
    if not validate_input(target, allowed_chars=r'^[\w\.\-:]+$'):
        return "Invalid target"
    try:
        result = subprocess.run(['nmap', '-sS', target], capture_output=True, text=True, timeout=300)
        return result.stdout
    except Exception as e:
        logging.error(f"Nmap error: {e}")
        return f"Error: {str(e)}"

def run_nikto(target):
    if not validate_input(target, allowed_chars=r'^[\w\.\-:]+$'):
        return "Invalid target"
    try:
        result = subprocess.run(['nikto', '-h', target], capture_output=True, text=True, timeout=300)
        return result.stdout
    except Exception as e:
        logging.error(f"Nikto error: {e}")
        return f"Error: {str(e)}"

def search_web(query):
    if not validate_input(query, max_length=200, allowed_chars=r'^[\w\s]+$'):
        return []
    try:
        # Fallback scraper if no SerpAPI key
        url = f"https://www.google.com/search?q={quote(query)}"
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        for g in soup.find_all('div', class_='g')[:5]:
            title = g.find('h3')
            link = g.find('a')
            snippet = g.find('div', class_='VwiC3b')
            if title and link:
                results.append({
                    'title': title.text,
                    'link': link['href'],
                    'snippet': snippet.text if snippet else ''
                })
        return results
    except Exception as e:
        logging.error(f"Search error: {e}")
        return []

def fetch_gaming_news():
    if 'gaming' in news_cache:
        return news_cache['gaming']
    feeds = ['https://www.ign.com/rss/articles.xml', 'https://www.gamespot.com/feeds/news/']
    news = []
    for feed in feeds:
        try:
            parsed = feedparser.parse(feed)
            for entry in parsed.entries[:5]:
                news.append({'title': entry.title, 'link': entry.link, 'summary': entry.get('summary', '')})
        except Exception as e:
            logging.error(f"Gaming news error: {e}")
    news_cache['gaming'] = news
    return news

def fetch_cybersecurity_news():
    if 'cybersecurity' in news_cache:
        return news_cache['cybersecurity']
    feeds = ['https://thehackernews.com/feed', 'https://krebsonsecurity.com/feed/']
    news = []
    for feed in feeds:
        try:
            parsed = feedparser.parse(feed)
            for entry in parsed.entries[:5]:
                news.append({'title': entry.title, 'link': entry.link, 'summary': entry.get('summary', '')})
        except Exception as e:
            logging.error(f"Cybersecurity news error: {e}")
    news_cache['cybersecurity'] = news
    return news

def get_network_info():
    try:
        connections = psutil.net_connections()
        net_info = []
        for conn in connections[:10]:
            if conn.laddr and conn.raddr:
                net_info.append({
                    'local': f"{conn.laddr.ip}:{conn.laddr.port}",
                    'remote': f"{conn.raddr.ip}:{conn.raddr.port}",
                    'status': conn.status
                })
        return net_info
    except Exception as e:
        logging.error(f"Network info error: {e}")
        return []

def run_diagnostic():
    try:
        checks = {
            'disk_space': psutil.disk_usage('/').percent < 90,
            'memory_usage': psutil.virtual_memory().percent < 90,
            'cpu_usage': psutil.cpu_percent(interval=1) < 90
        }
        return checks
    except Exception as e:
        logging.error(f"Diagnostic error: {e}")
        return {}

# Routes
@app.route('/')
def index():
    system_info = get_system_info()
    return render_template('index.html', system_info=system_info)

@app.route('/services', methods=['GET', 'POST'])
def services():
    if request.method == 'POST':
        service_name = request.form.get('service_name')
        action = request.form.get('action')
        if not validate_input(service_name):
            return jsonify({'status': 'error', 'message': 'Invalid service name'})
        try:
            if action == 'start':
                subprocess.run(['sudo', 'systemctl', 'start', service_name], check=True)
                logging.info(f"Started service: {service_name}")
            elif action == 'stop':
                subprocess.run(['sudo', 'systemctl', 'stop', service_name], check=True)
                logging.info(f"Stopped service: {service_name}")
            return jsonify({'status': 'success', 'message': f'Service {service_name} {action}ed'})
        except subprocess.CalledProcessError as e:
            logging.error(f"Failed to {action} service {service_name}: {e}")
            return jsonify({'status': 'error', 'message': f'Failed to {action} service'})

    services = ['ssh', 'apache2', 'nginx', 'docker', 'mysql']
    service_status = {service: get_service_status(service) for service in services}
    return render_template('services.html', services=service_status)

@app.route('/logs')
def logs():
    try:
        result = subprocess.run(['tail', '-n', '100', '/var/log/syslog'], capture_output=True, text=True)
        logs = result.stdout.splitlines()
        return render_template('logs.html', logs=logs)
    except subprocess.CalledProcessError as e:
        logging.error(f"Failed to read logs: {e}")
        return render_template('logs.html', logs=["Error reading logs"])

@app.route('/files')
def files():
    path = request.args.get('path', '/')
    if not os.path.abspath(path).startswith('/'):
        path = '/'
    try:
        files = [{'name': f, 'is_dir': os.path.isdir(os.path.join(path, f))} for f in os.listdir(path)]
        return render_template('files.html', path=path, files=files)
    except Exception as e:
        logging.error(f"File explorer error: {e}")
        return render_template('files.html', path=path, files=[])

@app.route('/packages', methods=['GET', 'POST'])
def packages():
    if request.method == 'POST':
        package_name = request.form.get('package_name')
        action = request.form.get('action')
        if not validate_input(package_name):
            return jsonify({'status': 'error', 'message': 'Invalid package name'})
        try:
            if action == 'install':
                subprocess.run(['sudo', 'apt', 'install', '-y', package_name], check=True)
                logging.info(f"Installed package: {package_name}")
            elif action == 'remove':
                subprocess.run(['sudo', 'apt', 'remove', '-y', package_name], check=True)
                logging.info(f"Removed package: {package_name}")
            return jsonify({'status': 'success', 'message': f'Package {package_name} {action}ed'})
        except subprocess.CalledProcessError as e:
            logging.error(f"Failed to {action} package {package_name}: {e}")
            return jsonify({'status': 'error', 'message': f'Failed to {action} package'})

    try:
        result = subprocess.run(['dpkg', '-l'], capture_output=True, text=True)
        packages = [line.split()[1] for line in result.stdout.splitlines() if line.startswith('ii')]
        return render_template('packages.html', packages=packages[:50])
    except Exception as e:
        logging.error(f"Package list error: {e}")
        return render_template('packages.html', packages=[])

@app.route('/users')
def users():
    users = get_users()
    groups = get_groups()
    return render_template('users.html', users=users, groups=groups)

@app.route('/pentest', methods=['GET', 'POST'])
def pentest():
    if request.method == 'POST':
        tool = request.form.get('tool')
        target = request.form.get('target')
        if tool not in ['nmap', 'nikto']:
            return jsonify({'status': 'error', 'message': 'Invalid tool'})
        result = run_nmap(target) if tool == 'nmap' else run_nikto(target)
        return jsonify({'status': 'success', 'result': result})
    return render_template('pentest.html')

@app.route('/search', methods=['GET', 'POST'])
def search():
    if request.method == 'POST':
        query = request.form.get('query')
        results = search_web(query)
        return jsonify({'status': 'success', 'results': results})
    return render_template('search.html')

@app.route('/gaming')
def gaming():
    news = fetch_gaming_news()
    return render_template('gaming.html', news=news)

@app.route('/cybersecurity')
def cybersecurity():
    news = fetch_cybersecurity_news()
    return render_template('cybersecurity.html', news=news)

@app.route('/network')
def network():
    net_info = get_network_info()
    return render_template('network.html', net_info=net_info)

@app.route('/diagnostics')
def diagnostics():
    checks = run_diagnostic()
    return render_template('diagnostics.html', checks=checks)

@app.route('/terminal', methods=['GET', 'POST'])
def terminal():
    if request.method == 'POST':
        command = request.form.get('command')
        if not validate_input(command, max_length=200, allowed_chars=r'^[\w\s\-\.\/]+$'):
            return jsonify({'status': 'error', 'message': 'Invalid command'})
        try:
            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
            return jsonify({'status': 'success', 'output': result.stdout + result.stderr})
        except Exception as e:
            logging.error(f"Terminal error: {e}")
            return jsonify({'status': 'error', 'message': str(e)})
    return render_template('terminal.html')

@app.route('/logo')
def logo():
    logo_path = '/usr/share/HackerOS/ICONS/HackerOS.png'
    if os.path.exists(logo_path):
        return send_file(logo_path, mimetype='image/png')
    return '', 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4545, debug=False)
