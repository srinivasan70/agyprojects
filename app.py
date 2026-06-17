import os
import re
import xml.etree.ElementTree as ET
import urllib.request
import time
import datetime
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Cache configuration
FEED_CACHE = None
CACHE_TIME = None
CACHE_EXPIRY = 600  # 10 minutes

def fetch_feed_data():
    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AntigravityFeedReader/1.0'}
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        xml_content = response.read()
    
    root = ET.fromstring(xml_content)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    entries = root.findall('atom:entry', ns)
    
    parsed_entries = []
    for entry in entries:
        title_elem = entry.find('atom:title', ns)
        id_elem = entry.find('atom:id', ns)
        updated_elem = entry.find('atom:updated', ns)
        link_elem = entry.find('atom:link', ns)
        content_elem = entry.find('atom:content', ns)
        
        title = title_elem.text if title_elem is not None else "No Title"
        entry_id = id_elem.text if id_elem is not None else ""
        updated = updated_elem.text if updated_elem is not None else ""
        link = link_elem.attrib.get('href') if link_elem is not None else ""
        content = content_elem.text if content_elem is not None else ""
        
        # Format updated date nicely
        # Input format example: '2026-06-16T00:00:00-07:00'
        formatted_date = title  # Default to the title if date parsing fails
        try:
            # Strip timezone offset for parsing if standard isoformat fails
            clean_date = updated.split('-')[0]
            if 'T' in clean_date:
                dt = datetime.datetime.strptime(clean_date.split('T')[0], "%Y-%m-%d")
                formatted_date = dt.strftime("%B %d, %Y")
        except Exception:
            pass
            
        # Split content by <h3>(.*?)</h3>
        parts = re.split(r'<h3>(.*?)</h3>', content, flags=re.DOTALL)
        updates = []
        if len(parts) > 1:
            header_content_pairs = zip(parts[1::2], parts[2::2])
            for h, c in header_content_pairs:
                updates.append({
                    'type': h.strip(),
                    'body': c.strip()
                })
        else:
            updates.append({
                'type': 'General',
                'body': content.strip()
            })
            
        parsed_entries.append({
            'title': title,
            'id': entry_id,
            'updated': updated,
            'formatted_date': formatted_date,
            'link': link,
            'updates': updates
        })
        
    return parsed_entries

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    global FEED_CACHE, CACHE_TIME
    
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    now = time.time()
    
    # Check if we should fetch new data
    should_fetch = (
        force_refresh or 
        not FEED_CACHE or 
        not CACHE_TIME or 
        (now - CACHE_TIME > CACHE_EXPIRY)
    )
    
    if should_fetch:
        try:
            FEED_CACHE = fetch_feed_data()
            CACHE_TIME = now
            status = "refreshed"
        except Exception as e:
            if FEED_CACHE:
                status = f"error_fallback_cache: {str(e)}"
            else:
                return jsonify({
                    'status': 'error',
                    'message': f"Failed to fetch release notes: {str(e)}"
                }), 500
    else:
        status = "cached"
        
    last_updated_str = datetime.datetime.fromtimestamp(CACHE_TIME).strftime("%Y-%m-%d %H:%M:%S")
    time_since_refresh = int(now - CACHE_TIME) if CACHE_TIME else 0
    
    return jsonify({
        'status': 'success',
        'cache_status': status,
        'last_updated': last_updated_str,
        'time_since_refresh': time_since_refresh,
        'releases': FEED_CACHE
    })

if __name__ == '__main__':
    # Bind to localhost port 5000
    app.run(host='127.0.0.1', port=5000, debug=True)
