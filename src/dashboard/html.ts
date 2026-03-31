export function getRegisterHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TokenLens \u2014 Create Account</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#0a0a0f;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(12px);border-radius:16px;padding:48px 40px;width:100%;max-width:480px;text-align:center;animation:fadeUp .4s ease}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.logo{font-size:32px;font-weight:700;color:#6366f1;margin-bottom:8px}
.tagline{font-size:14px;color:#94a3b8;margin-bottom:40px}
label{display:block;text-align:left;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
input{width:100%;padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e2e8f0;font-family:inherit;font-size:14px;outline:none;transition:border-color .2s}
input:focus{border-color:#6366f1}
.btn{width:100%;margin-top:16px;padding:13px;background:#6366f1;border:none;border-radius:8px;color:#fff;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s}
.btn:hover{opacity:.9}.btn:disabled{opacity:.5;cursor:not-allowed}
.err{margin-top:16px;padding:10px 14px;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:8px;font-size:13px;color:#f43f5e;display:none}
.link{display:block;margin-top:20px;font-size:13px;color:#64748b}
.link a{color:#6366f1;text-decoration:none}.link a:hover{text-decoration:underline}
.success{display:none;text-align:left}
.suc-title{font-size:22px;font-weight:800;text-align:center;margin-bottom:6px;letter-spacing:-.02em}
.suc-sub{font-size:13px;color:#94a3b8;text-align:center;margin-bottom:28px}
.scard{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:18px 20px;margin-bottom:12px}
.scard-label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.scard-title{font-size:14px;font-weight:700;margin-bottom:4px}
.scard-body{font-size:12px;color:#94a3b8;line-height:1.6}
.tok-box{display:flex;align-items:center;gap:8px;margin-top:10px}
.tok-val{flex:1;padding:10px 13px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-family:'SF Mono','Fira Code',monospace;font-size:12px;color:#a5b4fc;word-break:break-all}
.cp-btn{flex-shrink:0;padding:8px 14px;background:#6366f1;border:none;border-radius:8px;color:#fff;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .2s}
.cp-btn:hover{opacity:.85}
.warn{margin-top:8px;padding:8px 12px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:6px;font-size:11px;color:#f59e0b}
.codeblk{background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 14px;font-family:'SF Mono','Fira Code',monospace;font-size:11px;color:#a5b4fc;margin-top:10px;white-space:pre;overflow-x:auto;line-height:1.5}
.dash-btn{display:block;text-align:center;margin-top:20px;padding:14px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:10px;color:#6366f1;font-family:inherit;font-size:14px;font-weight:600;text-decoration:none;transition:all .2s}
.dash-btn:hover{background:rgba(99,102,241,0.2)}
</style>
</head>
<body>
<div class="card">
  <div id="form-section">
    <div class="logo">\u2b21 TokenLens</div>
    <div class="tagline">Free forever \u2014 no email required</div>
    <label for="nm">Your name (optional)</label>
    <input id="nm" type="text" placeholder="e.g. Alex" maxlength="50" autocomplete="off">
    <button class="btn" id="btn">Create Account \u2192</button>
    <div class="err" id="err">Something went wrong. Please try again.</div>
    <div class="link"><a href="/login">\u2190 Already have an account? Sign in</a></div>
  </div>
  <div class="success" id="success-section">
    <div class="suc-title">Account created!</div>
    <div class="suc-sub">Save your token \u2014 it won\u2019t be shown again.</div>
    <div class="scard">
      <div class="scard-label">Step 1</div>
      <div class="scard-title">Your API Token</div>
      <div class="tok-box">
        <div class="tok-val" id="tok-display"></div>
        <button class="cp-btn" id="cp-tok">Copy</button>
      </div>
      <div class="warn">\u26a0\ufe0f Shown once \u2014 copy it now and keep it safe.</div>
    </div>
    <div class="scard">
      <div class="scard-label">Step 2</div>
      <div class="scard-title">Chrome Extension</div>
      <div class="scard-body">Open TokenLens on any AI site. The hosted server is already pre-filled. Paste your token when prompted.</div>
      <div class="tok-box" style="margin-top:10px">
        <div class="tok-val" id="tok-copy2"></div>
        <button class="cp-btn" id="cp-tok2">Copy token</button>
      </div>
    </div>
    <div class="scard">
      <div class="scard-label">Step 3 (optional)</div>
      <div class="scard-title">Claude Desktop / Cursor MCP</div>
      <div class="scard-body">Add to your <code style="font-family:monospace;background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:4px">claude_desktop_config.json</code>:</div>
      <div class="codeblk" id="cfg-blk"></div>
      <button class="cp-btn" id="cp-cfg" style="margin-top:8px">Copy config</button>
    </div>
    <a class="dash-btn" id="dash-link" href="#">\u2192 Open Dashboard</a>
  </div>
</div>
<script>
var btn=document.getElementById('btn'),nm=document.getElementById('nm'),err=document.getElementById('err');
async function register(){
  var name=nm.value.trim()||'User';
  btn.disabled=true;btn.textContent='Creating\u2026';err.style.display='none';
  try{
    var r=await fetch('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name})});
    var d=await r.json();
    if(!r.ok){err.textContent=d.error||'Something went wrong.';err.style.display='block';btn.disabled=false;btn.textContent='Create Account \u2192';return;}
    showSuccess(d.token,d.name);
  }catch(e){
    err.textContent='Connection error. Please try again.';
    err.style.display='block';
    btn.disabled=false;btn.textContent='Create Account \u2192';
  }
}
function showSuccess(tok,name){
  document.getElementById('form-section').style.display='none';
  var s=document.getElementById('success-section');
  s.style.display='block';
  document.getElementById('tok-display').textContent=tok;
  document.getElementById('tok-copy2').textContent=tok;
  var cfg=JSON.stringify({mcpServers:{tokenlens:{url:'https://tokenlens-mcp-production.up.railway.app/sse',headers:{Authorization:'Bearer '+tok}}}},null,2);
  document.getElementById('cfg-blk').textContent=cfg;
  document.getElementById('dash-link').href='/login?token='+encodeURIComponent(tok);
  localStorage.setItem('tl_token',tok);
  localStorage.setItem('tl_name',name||'User');
  function cp(btnId,text,resetLabel){
    document.getElementById(btnId).addEventListener('click',function(){
      navigator.clipboard.writeText(text).then(function(){
        var b=document.getElementById(btnId);b.textContent='Copied!';
        setTimeout(function(){b.textContent=resetLabel;},2000);
      });
    });
  }
  cp('cp-tok',tok,'Copy');cp('cp-tok2',tok,'Copy token');cp('cp-cfg',cfg,'Copy config');
}
btn.addEventListener('click',register);
nm.addEventListener('keydown',function(e){if(e.key==='Enter')register();});
<\/script>
</body>
</html>`;
}

export function getLoginHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TokenLens \u2014 Login</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#0a0a0f;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(12px);border-radius:16px;padding:48px 40px;width:100%;max-width:420px;text-align:center;animation:fadeUp .4s ease}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
.logo{font-size:32px;font-weight:700;color:#6366f1;margin-bottom:8px}
.tagline{font-size:14px;color:#94a3b8;margin-bottom:40px}
label{display:block;text-align:left;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
input{width:100%;padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e2e8f0;font-family:inherit;font-size:14px;outline:none;transition:border-color .2s}
input:focus{border-color:#6366f1}
.btn{width:100%;margin-top:16px;padding:13px;background:#6366f1;border:none;border-radius:8px;color:#fff;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s}
.btn:hover{opacity:.9}.btn:disabled{opacity:.5;cursor:not-allowed}
.err{margin-top:16px;padding:10px 14px;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:8px;font-size:13px;color:#f43f5e;display:none}
.shake{animation:shake .4s ease}
.link{display:block;margin-top:20px;font-size:13px;color:#64748b}
.link a{color:#6366f1;text-decoration:none}.link a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card" id="card">
  <div class="logo">\u2b21 TokenLens</div>
  <div class="tagline">Token Intelligence for AI Editors</div>
  <label for="tok">Your API Token</label>
  <input id="tok" type="password" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off">
  <button class="btn" id="btn">Sign In</button>
  <div class="err" id="err">Invalid token. Please check and try again.</div>
  <div class="link"><a href="/register">No account? Create one free \u2192</a></div>
</div>
<script>
if(localStorage.getItem('tl_token'))location.href='/dashboard';
var btn=document.getElementById('btn'),inp=document.getElementById('tok'),err=document.getElementById('err'),card=document.getElementById('card');
(function(){var p=new URLSearchParams(location.search).get('token');if(p)inp.value=p;})();
async function login(){
  var t=inp.value.trim();if(!t)return;
  btn.disabled=true;btn.textContent='Verifying\u2026';
  try{
    var r=await fetch('/auth/validate',{headers:{'Authorization':'Bearer '+t}});
    if(r.ok){var d=await r.json();localStorage.setItem('tl_token',t);localStorage.setItem('tl_name',d.name||'User');location.href='/dashboard';}
    else{err.style.display='block';card.classList.remove('shake');void card.offsetWidth;card.classList.add('shake');}
  }catch(e){err.textContent='Connection error.';err.style.display='block';}
  btn.disabled=false;btn.textContent='Sign In';
}
btn.addEventListener('click',login);
inp.addEventListener('keydown',function(e){if(e.key==='Enter')login();});
<\/script>
</body>
</html>`;
}

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TokenLens Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0a0a0f;--surface:rgba(255,255,255,0.03);--border:rgba(255,255,255,0.08);--primary:#6366f1;--rose:#f43f5e;--green:#22c55e;--yellow:#f59e0b;--text:#e2e8f0;--muted:#64748b;--r:14px}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
nav{display:flex;align-items:center;justify-content:space-between;padding:0 28px;height:60px;border-bottom:1px solid var(--border);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;background:rgba(10,10,15,0.85)}
.nav-l{display:flex;align-items:center;gap:12px}
.logo{font-size:20px;font-weight:800;color:var(--primary);letter-spacing:-.03em}
.ver-badge{font-size:10px;font-weight:600;background:rgba(99,102,241,0.15);color:var(--primary);border:1px solid rgba(99,102,241,0.3);padding:2px 8px;border-radius:20px}
.live{width:8px;height:8px;border-radius:50%;background:#94a3b8;transition:background .3s;flex-shrink:0}
.live.on{background:var(--green);animation:livepulse 2s infinite}
@keyframes livepulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}60%{box-shadow:0 0 0 6px rgba(34,197,94,0)}}
.nav-r{display:flex;align-items:center;gap:12px}
.uname{font-size:13px;color:var(--muted)}
.btn-out{font-size:12px;font-weight:500;padding:6px 14px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;transition:all .2s;font-family:inherit}
.btn-out:hover{border-color:var(--rose);color:var(--rose)}
.wrap{max-width:1400px;margin:0 auto;padding:28px 28px 80px}
.glass{background:var(--surface);border:1px solid var(--border);backdrop-filter:blur(12px);border-radius:var(--r)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.stat{padding:22px 24px;animation:up .5s ease both}
.stat:nth-child(1){animation-delay:.05s}.stat:nth-child(2){animation-delay:.1s}.stat:nth-child(3){animation-delay:.15s}.stat:nth-child(4){animation-delay:.2s}
@keyframes up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.stat-ico{font-size:18px;margin-bottom:10px;opacity:.7}
.stat-lbl{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.stat-val{font-size:30px;font-weight:800;line-height:1;letter-spacing:-.02em}
.grid2{display:grid;grid-template-columns:3fr 2fr;gap:20px;align-items:start}
.chart-card{padding:24px;animation:up .5s .25s ease both}
.ctitle{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:20px}
.dough-wrap{position:relative;width:200px;height:200px;margin:0 auto 20px}
.dough-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.dough-val{font-size:24px;font-weight:800;letter-spacing:-.02em}
.dough-lbl{font-size:11px;color:var(--muted);margin-top:2px}
.leg-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}
.leg{display:flex;align-items:center;gap:7px;font-size:12px}
.dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.leg-n{color:var(--muted)}
.leg-v{margin-left:auto;font-weight:600;font-size:11px}
.sess-card{padding:24px;animation:up .5s .3s ease both}
.tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px}
.tab{font-size:11px;font-weight:600;padding:5px 11px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap}
.tab.on{background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:var(--primary)}
.tcnt{display:inline-block;background:rgba(255,255,255,0.08);border-radius:10px;padding:0 5px;margin-left:3px;font-size:10px}
.srow{display:grid;grid-template-columns:65px 76px 1fr 55px 52px 60px;align-items:center;gap:6px;padding:9px 8px;border-bottom:1px solid var(--border);cursor:pointer;border-radius:8px;margin:0 -8px;transition:background .12s}
.srow:last-child{border-bottom:none}
.srow:hover{background:rgba(99,102,241,.07)}
.srow.on{background:rgba(99,102,241,.13)}
.shdr{display:grid;grid-template-columns:65px 76px 1fr 55px 52px 60px;gap:6px;padding:0 8px 8px;margin:0 -8px}
.chdr{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.tmuted{font-size:11px;color:var(--muted)}
.tmono{font-family:'SF Mono','Fira Code',monospace;font-size:11px}
.eb{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.eb-cursor{background:rgba(99,102,241,.15);color:#a5b4fc}
.eb-claude_desktop{background:rgba(244,63,94,.12);color:#fb7185}
.eb-v0{background:rgba(34,197,94,.12);color:#4ade80}
.eb-chatgpt{background:rgba(16,185,129,.12);color:#34d399}
.eb-api{background:rgba(245,158,11,.12);color:#fbbf24}
.eb-other{background:rgba(100,116,139,.12);color:#94a3b8}
.wp{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700}
.wp-clean{background:rgba(34,197,94,.12);color:var(--green)}
.wp-bad{background:rgba(244,63,94,.12);color:var(--rose)}
.no-rows{text-align:center;padding:32px;color:var(--muted);font-size:13px}
#ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199;display:none;backdrop-filter:blur(3px)}
#ov.on{display:block}
#dp{position:fixed;top:0;right:0;bottom:0;width:500px;max-width:100vw;background:#13131a;border-left:1px solid var(--border);z-index:200;overflow-y:auto;transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1)}
#dp.on{transform:translateX(0)}
.dp-hdr{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--border);position:sticky;top:0;background:#13131a;z-index:1}
.dp-title{font-size:13px;font-weight:700}
.btn-x{background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted);cursor:pointer;padding:5px 10px;font-size:13px;transition:all .2s;font-family:inherit}
.btn-x:hover{border-color:var(--rose);color:var(--rose)}
.dp-body{padding:22px}
.meta-g{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.meta-c{background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;padding:11px 13px}
.meta-l{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}
.meta-v{font-size:13px;font-weight:600}
.id-row{display:flex;align-items:center;gap:8px;margin-bottom:18px;font-size:12px;color:var(--muted);flex-wrap:wrap}
.id-txt{font-family:'SF Mono','Fira Code',monospace;font-size:10px;word-break:break-all}
.cpbtn{font-size:10px;padding:3px 8px;border:1px solid var(--border);border-radius:5px;background:transparent;color:var(--muted);cursor:pointer;font-family:inherit;transition:all .15s;flex-shrink:0}
.cpbtn:hover{border-color:var(--primary);color:var(--primary)}
.seg-bar{display:flex;height:20px;border-radius:6px;overflow:hidden;margin-bottom:10px}
.seg{height:100%}
.seg-leg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 10px;margin-bottom:18px}
.segl{display:flex;align-items:center;gap:5px;font-size:11px}
.slbl{color:var(--muted)}
.sval{margin-left:auto;font-weight:600}
.slabel{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 8px}
.wcard{padding:10px 13px;border-radius:8px;margin-bottom:7px;font-size:12px;line-height:1.5}
.w-high{background:rgba(244,63,94,.06);border-left:3px solid var(--rose)}
.w-medium{background:rgba(245,158,11,.06);border-left:3px solid var(--yellow)}
.w-low{background:rgba(99,102,241,.06);border-left:3px solid var(--primary)}
.sgcard{padding:10px 13px;border-radius:8px;margin-bottom:7px;font-size:12px;line-height:1.5;background:rgba(34,197,94,.05);border-left:3px solid var(--green)}
.stag{display:inline-block;background:rgba(34,197,94,.15);color:var(--green);font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:6px;vertical-align:middle}
.btn-exp{display:block;width:100%;margin-top:18px;padding:11px;background:transparent;border:1px solid var(--primary);border-radius:10px;color:var(--primary);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s}
.btn-exp:hover{background:rgba(99,102,241,.1)}
.ob{text-align:center;padding:32px 0}
.ob-title{font-size:20px;font-weight:800;margin-bottom:6px;letter-spacing:-.02em}
.ob-sub{font-size:13px;color:var(--muted);margin-bottom:32px}
.ob-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:left}
.ob-step{padding:18px;border-radius:12px;border:1px solid var(--border);background:var(--surface)}
.ob-n{width:26px;height:26px;border-radius:7px;background:rgba(99,102,241,.2);color:var(--primary);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
.ob-t{font-size:12px;font-weight:700;margin-bottom:5px}
.ob-d{font-size:11px;color:var(--muted);line-height:1.5}
.codeblk{background:rgba(0,0,0,.4);border:1px solid var(--border);border-radius:7px;padding:10px 12px;font-family:'SF Mono','Fira Code',monospace;font-size:10px;color:#a5b4fc;margin-top:8px;position:relative;white-space:pre;overflow-x:auto;line-height:1.5}
.cp-code{position:absolute;top:6px;right:6px;font-size:10px;padding:2px 7px;border:1px solid var(--border);border-radius:4px;background:rgba(255,255,255,.05);color:var(--muted);cursor:pointer;font-family:inherit}
.skel{background:linear-gradient(90deg,rgba(255,255,255,.04) 0%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.04) 100%);background-size:200% 100%;animation:shim 1.5s infinite;border-radius:6px}
@keyframes shim{0%{background-position:200% 0}100%{background-position:-200% 0}}
#tarea{position:fixed;top:70px;right:22px;z-index:300;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.toast{background:#13131a;border:1px solid var(--border);border-radius:10px;padding:11px 16px;font-size:13px;font-weight:500;pointer-events:auto;animation:tin .25s ease;box-shadow:0 8px 32px rgba(0,0,0,.5)}
@keyframes tin{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
.tout{animation:tout .25s ease forwards}
@keyframes tout{to{opacity:0;transform:translateX(16px)}}
.tg{border-left:3px solid var(--green)}
.errst{text-align:center;padding:48px}
.errst h3{font-size:17px;font-weight:700;color:var(--rose);margin-bottom:8px}
.errst p{font-size:13px;color:var(--muted);margin-bottom:18px}
.btn-retry{padding:10px 22px;background:var(--primary);border:none;border-radius:8px;color:#fff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer}
footer{text-align:center;padding:22px;font-size:11px;color:var(--muted);border-top:1px solid var(--border);margin-top:40px}
@media(max-width:900px){.grid2{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}#dp{width:100%}.ob-steps{grid-template-columns:1fr}}
@media(max-width:600px){.stats{grid-template-columns:1fr 1fr}.srow,.shdr{grid-template-columns:55px 1fr 45px 50px}}
</style>
</head>
<body>
<nav>
  <div class="nav-l">
    <span class="logo">\u2b21 TokenLens</span>
    <span class="ver-badge">v1.0.0</span>
    <div class="live" id="live" title="Real-time"></div>
  </div>
  <div class="nav-r">
    <span class="uname" id="uname">\u2014</span>
    <button class="btn-out" id="btnout">Sign out</button>
  </div>
</nav>
<div class="wrap">
  <div class="stats">
    <div class="glass stat"><div class="stat-ico">\u2b21</div><div class="stat-lbl">Sessions</div><div class="stat-val" id="sv0">\u2014</div></div>
    <div class="glass stat"><div class="stat-ico">\u25ce</div><div class="stat-lbl">Total Tokens</div><div class="stat-val" id="sv1">\u2014</div></div>
    <div class="glass stat"><div class="stat-ico">\u25c8</div><div class="stat-lbl">Total Cost</div><div class="stat-val" id="sv2">\u2014</div></div>
    <div class="glass stat"><div class="stat-ico">\u26a0</div><div class="stat-lbl">Waste Detected</div><div class="stat-val" id="sv3">\u2014</div></div>
  </div>
  <div class="grid2">
    <div class="glass chart-card" id="csec">
      <div class="ctitle">Token Distribution</div>
      <div id="cinner"><div class="skel" style="width:200px;height:200px;border-radius:50%;margin:0 auto 20px"></div></div>
    </div>
    <div class="glass sess-card" id="ssec">
      <div class="ctitle">Recent Sessions</div>
      <div class="tabs" id="tabs"></div>
      <div id="sinner"><div class="skel" style="height:14px;margin-bottom:8px"></div><div class="skel" style="height:14px;width:80%;margin-bottom:8px"></div><div class="skel" style="height:14px;width:60%"></div></div>
    </div>
  </div>
</div>
<footer>TokenLens v1.0.0 &nbsp;\u00b7&nbsp; Open Source</footer>
<div id="ov"></div>
<div id="dp">
  <div class="dp-hdr"><div class="dp-title" id="dptitle">Session Detail</div><button class="btn-x" id="dpx">\u2715 Close</button></div>
  <div class="dp-body" id="dpbody"></div>
</div>
<div id="tarea"></div>
<script>
// ── constants ──────────────────────────────────────────────────────────────
var COLORS={system:'#6366f1',history:'#22c55e',tools:'#f59e0b',userMessage:'#3b82f6',response:'#ec4899'};
var CLABELS={system:'System',history:'History',tools:'Tools',userMessage:'User Msg',response:'Response'};
var ECLR={cursor:'eb-cursor',claude_desktop:'eb-claude_desktop',v0:'eb-v0',chatgpt:'eb-chatgpt',api:'eb-api',other:'eb-other'};
var ELBL={cursor:'Cursor',claude_desktop:'Claude Desktop',v0:'v0',chatgpt:'ChatGPT',api:'API',other:'Other'};

// ── state ──────────────────────────────────────────────────────────────────
var allS=[],filtS=[],activeTab='all',selId=null,chart=null;

// ── navbar (no auth required) ──────────────────────────────────────────────
document.getElementById('uname').textContent=localStorage.getItem('tl_name')||'Guest';
document.getElementById('btnout').onclick=function(){
  localStorage.removeItem('tl_token');
  localStorage.removeItem('tl_name');
  location.href='/login';
};

// ── helpers ────────────────────────────────────────────────────────────────
function fmt(n){if(!n||isNaN(n))return'0';if(n>=1e6)return(n/1e6).toFixed(2)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return''+Math.round(n);}
function ago(ts){var s=Math.floor((Date.now()-ts)/1000);if(s<10)return'just now';if(s<60)return s+'s ago';var m=Math.floor(s/60);if(m<60)return m+'m ago';var h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago';}
function ebadge(e){var k=e||'other';return'<span class="eb '+(ECLR[k]||'eb-other')+'">'+(ELBL[k]||k)+'</span>';}
function wpill(n){return n?'<span class="wp wp-bad">'+n+' issue'+(n>1?'s':'')+'</span>':'<span class="wp wp-clean">Clean</span>';}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toast(msg){var a=document.getElementById('tarea'),el=document.createElement('div');el.className='toast tg';el.textContent=msg;a.appendChild(el);setTimeout(function(){el.classList.add('tout');setTimeout(function(){el.remove();},300);},3000);}

// ── chart ──────────────────────────────────────────────────────────────────
function renderChart(b){
  var keys=['system','history','tools','userMessage','response'];
  var vals=keys.map(function(k){return b[k]||0;});
  var tot=vals.reduce(function(a,v){return a+v;},0)||1;
  var h='<div class="dough-wrap"><canvas id="dc"></canvas><div class="dough-center"><div class="dough-val">'+fmt(tot)+'</div><div class="dough-lbl">tokens</div></div></div><div class="leg-grid">';
  keys.forEach(function(k){var p=((b[k]||0)/tot*100).toFixed(1);h+='<div class="leg"><div class="dot" style="background:'+COLORS[k]+'"></div><span class="leg-n">'+CLABELS[k]+'</span><span class="leg-v">'+p+'%</span></div>';});
  h+='</div>';
  document.getElementById('cinner').innerHTML=h;
  var ctx=document.getElementById('dc').getContext('2d');
  if(chart)chart.destroy();
  chart=new Chart(ctx,{type:'doughnut',data:{labels:keys.map(function(k){return CLABELS[k];}),datasets:[{data:vals,backgroundColor:keys.map(function(k){return COLORS[k];}),borderWidth:2,borderColor:'#13131a',hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:true,cutout:'72%',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+c.label+': '+fmt(c.raw)+' ('+((c.raw/tot)*100).toFixed(1)+'%)';}}}},animation:{duration:700,easing:'easeOutQuart'}}});
}

// ── tabs & rows ────────────────────────────────────────────────────────────
function renderTabs(){
  var eds=['all','cursor','claude_desktop','v0','chatgpt','api','other'];
  var h='';
  eds.forEach(function(e){
    var cnt=e==='all'?allS.length:allS.filter(function(s){return(s.editor||'other')===e;}).length;
    if(e!=='all'&&cnt===0)return;
    h+='<button class="tab'+(e===activeTab?' on':'')+'" data-e="'+e+'">'+(e==='all'?'All':(ELBL[e]||e))+'<span class="tcnt">'+cnt+'</span></button>';
  });
  var tabs=document.getElementById('tabs');
  tabs.innerHTML=h;
  tabs.querySelectorAll('.tab').forEach(function(b){b.addEventListener('click',function(){activeTab=b.getAttribute('data-e');renderTabs();renderRows();});});
}

function renderRows(){
  filtS=activeTab==='all'?allS:allS.filter(function(s){return(s.editor||'other')===activeTab;});
  if(!filtS.length){document.getElementById('sinner').innerHTML='<div class="no-rows">No sessions yet.</div>';return;}
  var h='<div class="shdr"><span class="chdr">Time</span><span class="chdr">Editor</span><span class="chdr">Model</span><span class="chdr">Tokens</span><span class="chdr">Cost</span><span class="chdr">Waste</span></div>';
  filtS.slice(0,15).forEach(function(s){
    h+='<div class="srow'+(s.id===selId?' on':'')+'" data-id="'+s.id+'">';
    h+='<span class="tmuted">'+ago(s.timestamp)+'</span>';
    h+=ebadge(s.editor);
    h+='<span class="tmono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.model+'</span>';
    h+='<span style="font-size:12px;font-weight:600">'+fmt(s.totalTokens)+'</span>';
    h+='<span class="tmuted">$'+s.cost.toFixed(4)+'</span>';
    h+=wpill(s.wasteCount);
    h+='</div>';
  });
  var si=document.getElementById('sinner');
  si.innerHTML=h;
  si.querySelectorAll('.srow').forEach(function(r){r.addEventListener('click',function(){openDP(r.getAttribute('data-id'));});});
}

// ── onboarding ─────────────────────────────────────────────────────────────
function renderOnboarding(){
  var cfg=esc(JSON.stringify({mcpServers:{tokenlens:{url:'https://tokenlens-mcp-production.up.railway.app/sse',headers:{Authorization:'Bearer YOUR_TOKEN'}}}},null,2));
  var h='<div class="ob"><div class="ob-title">Welcome to TokenLens</div><div class="ob-sub">Get started in 3 steps</div><div class="ob-steps">';
  h+='<div class="ob-step"><div class="ob-n">1</div><div class="ob-t">Add to your editor</div><div class="ob-d">Paste this config into Cursor or Claude Desktop settings. Replace <code style="font-family:monospace;background:rgba(255,255,255,0.07);padding:1px 4px;border-radius:3px">YOUR_TOKEN</code> with your token &mdash; <a href="/register" style="color:var(--primary);text-decoration:none">get one free at /register</a>.</div><div class="codeblk" id="cfgblk">'+cfg+'<button class="cp-code" onclick="cpCode(\\'cfgblk\\',this)">Copy</button></div></div>';
  h+='<div class="ob-step"><div class="ob-n">2</div><div class="ob-t">Analyze a conversation</div><div class="ob-d">After chatting, call analyze_conversation with your messages array.</div><div class="codeblk">analyze_conversation({\\n  messages: [...],\\n  model: "claude-sonnet-4-5",\\n  editor: "cursor"\\n})</div></div>';
  h+='<div class="ob-step"><div class="ob-n">3</div><div class="ob-t">See your insights</div><div class="ob-d">This dashboard updates in real-time as you use TokenLens in your editor.</div></div>';
  h+='</div></div>';
  document.getElementById('csec').innerHTML='<div class="ctitle">Token Distribution</div>'+h;
}

function cpCode(id,btn){var t=document.getElementById(id).textContent.replace('Copy','').trim();navigator.clipboard.writeText(t).then(function(){btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy';},2000);});}

// ── detail panel ───────────────────────────────────────────────────────────
function openDP(id){
  if(id===selId){closeDP();return;}
  selId=id;
  document.querySelectorAll('.srow').forEach(function(r){r.classList.toggle('on',r.getAttribute('data-id')===id);});
  document.getElementById('ov').classList.add('on');
  document.getElementById('dp').classList.add('on');
  document.getElementById('dpbody').innerHTML='<div class="skel" style="height:14px;margin:10px 0"></div><div class="skel" style="height:14px;width:60%"></div>';
  fetch('/api/dashboard/session/'+id)
    .then(function(r){return r.json();})
    .then(function(s){renderDPBody(s);})
    .catch(function(){document.getElementById('dpbody').innerHTML='<div style="color:var(--rose);padding:20px">Failed to load session.</div>';});
}

function closeDP(){
  selId=null;
  document.getElementById('ov').classList.remove('on');
  document.getElementById('dp').classList.remove('on');
  document.querySelectorAll('.srow').forEach(function(r){r.classList.remove('on');});
}
document.getElementById('ov').addEventListener('click',closeDP);
document.getElementById('dpx').addEventListener('click',closeDP);

function renderDPBody(s){
  var b=s.breakdown||{},tot=b.total||1;
  var keys=['system','history','tools','userMessage','response'];
  var h='<div class="meta-g">';
  h+='<div class="meta-c"><div class="meta-l">Model</div><div class="meta-v">'+s.model+'</div></div>';
  h+='<div class="meta-c"><div class="meta-l">Provider</div><div class="meta-v">'+s.provider+'</div></div>';
  h+='<div class="meta-c"><div class="meta-l">Editor</div><div class="meta-v">'+ebadge(s.editor)+'</div></div>';
  h+='<div class="meta-c"><div class="meta-l">Time</div><div class="meta-v" style="font-size:11px">'+new Date(s.timestamp).toLocaleString()+'</div></div>';
  h+='</div>';
  h+='<div class="id-row"><span>ID:</span><span class="id-txt">'+s.id+'</span><button class="cpbtn" id="cpid">Copy</button></div>';
  h+='<div class="slabel">Token Breakdown</div>';
  h+='<div class="seg-bar">';
  keys.forEach(function(k){var p=(b[k]||0)/tot*100;if(p>0.1)h+='<div class="seg" style="width:'+p+'%;background:'+COLORS[k]+'" title="'+CLABELS[k]+': '+(b[k]||0)+'"></div>';});
  h+='</div><div class="seg-leg">';
  keys.forEach(function(k){h+='<div class="segl"><div class="dot" style="background:'+COLORS[k]+'"></div><span class="slbl">'+CLABELS[k]+'</span><span class="sval">'+fmt(b[k]||0)+'</span></div>';});
  h+='</div>';
  h+='<p style="font-size:11px;color:var(--muted);margin-bottom:4px">Total: '+fmt(b.total)+' &nbsp;\u00b7&nbsp; $'+s.cost.toFixed(6)+'</p>';
  if(s.waste&&s.waste.length){
    h+='<div class="slabel">Waste</div>';
    s.waste.forEach(function(w){h+='<div class="wcard w-'+w.severity+'"><strong>'+w.type.replace(/_/g,' ')+'</strong> \u2014 '+w.description+(w.estimatedWaste>0?' <span style="font-size:10px;color:var(--muted)">(~'+w.estimatedWaste+' tokens)</span>':'')+'</div>';});
  }
  if(s.suggestions&&s.suggestions.length){
    h+='<div class="slabel">Suggestions</div>';
    s.suggestions.forEach(function(sg){h+='<div class="sgcard"><strong>'+sg.priority+'. '+sg.title+'</strong>'+(sg.estimatedSavings>0?'<span class="stag">save ~'+fmt(sg.estimatedSavings)+'</span>':'')+'<br><span style="color:var(--muted)">'+sg.description+'</span></div>';});
  }
  h+='<button class="btn-exp" id="expbtn">\u2193 Export Markdown</button>';
  document.getElementById('dptitle').textContent='Session \u00b7 '+ago(s.timestamp);
  document.getElementById('dpbody').innerHTML=h;
  document.getElementById('cpid').addEventListener('click',function(){navigator.clipboard.writeText(s.id).then(function(){document.getElementById('cpid').textContent='Copied!';setTimeout(function(){document.getElementById('cpid').textContent='Copy';},2000);});});
  document.getElementById('expbtn').addEventListener('click',function(){dlMd(s);});
}

function dlMd(s){
  var b=s.breakdown||{},tot=b.total||1,p=function(n){return((n/tot)*100).toFixed(1)+'%';};
  var lines=['# TokenLens Report','','**Session:** '+s.id,'**Date:** '+new Date(s.timestamp).toLocaleString(),'**Model:** '+s.model,'**Provider:** '+s.provider,'**Editor:** '+(s.editor||'other'),'**Cost:** $'+s.cost.toFixed(6),'','## Token Breakdown','','| Category | Tokens | % |','|----------|--------|---|','| System | '+(b.system||0)+' | '+p(b.system||0)+' |','| History | '+(b.history||0)+' | '+p(b.history||0)+' |','| Tools | '+(b.tools||0)+' | '+p(b.tools||0)+' |','| User Message | '+(b.userMessage||0)+' | '+p(b.userMessage||0)+' |','| Response | '+(b.response||0)+' | '+p(b.response||0)+' |','| **Total** | **'+(b.total||0)+'** | 100% |',''];
  if(s.waste&&s.waste.length){lines.push('## Waste','');s.waste.forEach(function(w){var i=w.severity==='high'?'\uD83D\uDD34':w.severity==='medium'?'\uD83D\uDFE1':'\uD83D\uDFE2';lines.push('### '+i+' '+w.type.replace(/_/g,' '));lines.push(w.description);if(w.estimatedWaste>0)lines.push('*~'+w.estimatedWaste+' tokens*');lines.push('');});}
  if(s.suggestions&&s.suggestions.length){lines.push('## Suggestions','');s.suggestions.forEach(function(sg){lines.push('### '+sg.priority+'. '+sg.title);lines.push(sg.description);if(sg.estimatedSavings>0)lines.push('*Save ~'+sg.estimatedSavings+' tokens*');lines.push('');});}
  var blob=new Blob([lines.join('\\n')],{type:'text/markdown'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tokenlens-'+s.id.slice(0,8)+'.md';a.click();
  toast('Report downloaded');
}

// ── load (no auth, plain fetch) ────────────────────────────────────────────
function load(){
  fetch('/api/dashboard')
    .then(function(r){
      if(!r.ok)throw new Error('HTTP '+r.status);
      return r.json();
    })
    .then(function(data){
      var st=data.stats||{};
      var sessions=data.recentSessions||[];
      // stat cards — direct injection, no animation
      document.getElementById('sv0').textContent=st.totalSessions||0;
      document.getElementById('sv1').textContent=fmt(st.totalTokens||0);
      document.getElementById('sv2').textContent='$'+(st.totalCost||0).toFixed(4);
      var wc=sessions.filter(function(s){return s.wasteCount>0;}).length;
      document.getElementById('sv3').textContent=wc;
      // chart / onboarding
      allS=sessions;
      if(allS.length===0){renderOnboarding();}else{renderChart(data.breakdown||{});}
      // tabs + rows
      renderTabs();
      renderRows();
    })
    .catch(function(e){
      console.error('[TokenLens] load failed',e);
      document.getElementById('csec').innerHTML='<div class="errst"><h3>Error loading data</h3><p>'+e.message+'</p><button class="btn-retry" onclick="load()">Retry</button></div>';
      document.getElementById('sinner').innerHTML='<div class="no-rows">Failed to load sessions.</div>';
    });
}

// ── real-time SSE ──────────────────────────────────────────────────────────
var ld=document.getElementById('live');
var es=new EventSource('/dashboard/events');
es.onopen=function(){ld.classList.add('on');};
es.onerror=function(){ld.classList.remove('on');};
es.onmessage=function(ev){
  try{
    var m=JSON.parse(ev.data);
    if(m.type==='new_session'&&m.session){
      var s=m.session;
      allS.unshift({id:s.id,provider:s.provider,model:s.model,editor:s.editor||'other',timestamp:s.timestamp,totalTokens:s.breakdown?s.breakdown.total:0,cost:s.cost,wasteCount:s.waste?s.waste.length:0});
      renderTabs();renderRows();
      toast('New session \u2014 '+fmt(allS[0].totalTokens)+' tokens');
    }
  }catch(e){}
};

// ── keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown',function(e){
  if(e.key==='Escape')closeDP();
  if((e.key==='r'||e.key==='R')&&document.activeElement.tagName!=='INPUT')load();
});

load();
<\/script>
</body>
</html>`;
}
