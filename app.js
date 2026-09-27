let registerMode=false;
const $=id=>document.getElementById(id);
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Có lỗi");return d}
function showAuth(){ $("auth").style.display="grid"; }
function hideAuth(){ $("auth").style.display="none"; }
async function loadChat(){const d=await api("/api/chat/messages"),box=$("chatMessages");box.innerHTML=d.messages.map(m=>`<div class="chat-msg"><div><span class="chat-user">👤 ${esc(m.username)}</span><span class="chat-time">${timeAgo(m.created_at)}</span></div><div class="chat-text">${esc(m.message)}</div></div>`).join("")||'<div style="color:#7891a4;text-align:center;padding:25px">Chưa có tin nhắn. Hãy là người đầu tiên!</div>';box.scrollTop=box.scrollHeight;$("chatStatus").textContent="● Trực tuyến"}
async function sendChat(){const input=$("chatInput"),message=input.value.trim();if(!message)return;try{await api("/api/chat/messages",{method:"POST",body:JSON.stringify({message})});input.value="";await loadChat()}catch(e){alert(e.message)}}
$("chatSend").onclick=sendChat;$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendChat()});
async function boot(){
  try{const d=await api("/api/me"); if(d.user){hideAuth();renderUser(d.user);await loadMenus();await loadLive();await loadChat()}else showAuth()}
  catch{showAuth()}
}
function renderUser(u){$("username").textContent=u.username;$("joined").textContent="Tham gia: "+new Date(u.created_at+"Z").toLocaleDateString("vi-VN")}
$("toggleAuth").onclick=()=>{registerMode=!registerMode;$("authTitle").textContent=registerMode?"Đăng ký":"Đăng nhập";$("authBtn").textContent=registerMode?"Tạo tài khoản":"Đăng nhập";$("toggleAuth").textContent=registerMode?"Đã có tài khoản? Đăng nhập":"Chưa có tài khoản? Đăng ký";$("authMsg").textContent=""};
$("authBtn").onclick=async()=>{try{const d=await api(registerMode?"/api/register":"/api/login",{method:"POST",body:JSON.stringify({username:$("authUser").value,password:$("authPass").value})});hideAuth();const me=await api("/api/me");renderUser(me.user);await loadMenus();await loadLive()}catch(e){$("authMsg").textContent=e.message}};
$("logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};
async function loadMenus(){const d=await api("/api/menus");$("cards").innerHTML=d.menus.map(m=>`<article class="card"><span class="hot">${m.hot?"HOT":"MENU"}</span><h3>🔗 ${esc(m.title)}</h3><span class="tag">${m.vip?"♛ VIP":"FREE"} · ${esc(m.category)}</span></article>`).join("")||'<div class="glass" style="padding:20px">Chưa có nội dung.</div>'}
async function loadLive(){const d=await api("/api/live");$("liveList").innerHTML=d.items.map(x=>`<div>👤 <b>${esc(x.username)}</b> vừa nhận nội dung · <span>${timeAgo(x.claimed_at)}</span></div>`).join("")||"<div>Chưa có lượt nhận nào.</div>"}
$("claimBtn").onclick=async()=>{try{const d=await api("/api/claim",{method:"POST",body:JSON.stringify({key:$("key").value})});window.open(d.download_url,"_blank","noopener,noreferrer");$("key").value="";await loadLive();await loadChat()}catch(e){alert(e.message)}};
$("search").oninput=async e=>{const d=await api("/api/menus?q="+encodeURIComponent(e.target.value));$("cards").innerHTML=d.menus.map(m=>`<article class="card"><span class="hot">${m.hot?"HOT":"MENU"}</span><h3>🔗 ${esc(m.title)}</h3><span class="tag">${m.vip?"♛ VIP":"FREE"} · ${esc(m.category)}</span></article>`).join("")};
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function timeAgo(s){const n=(Date.now()-new Date(s+"Z").getTime())/3600000;return n<1?"vừa xong":Math.floor(n)+" giờ trước"}
boot();
