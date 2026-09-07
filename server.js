const http=require("http");
const {Server}=require("socket.io");

const PORT=process.env.PORT||10000;
const WORLD={w:1200,d:900};
const players=new Map();
const bullets=[];
const loot=[];
const safe={x:0,z:0,r:450,target:450,timer:0};

const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/plain"});
  res.end("DESI DROP multiplayer server online");
});

const io=new Server(server,{cors:{origin:"*",methods:["GET","POST"]}});

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function dist(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}
function rnd(a,b){return a+Math.random()*(b-a)}

for(let i=0;i<55;i++)loot.push({x:rnd(-560,560),z:rnd(-410,410),type:Math.random()<.68?"ammo":"med",active:true});

function makePlayer(id,name){
  return {id,name:name||"Desi Player",x:rnd(-500,500),z:rnd(-350,350),y:0,hp:100,ammo:30,med:2,kills:0,alive:true,ax:0,az:-1,dx:0,dz:0,cool:0};
}

io.on("connection",socket=>{
  socket.emit("welcome",{id:socket.id,world:WORLD});

  socket.on("join",d=>{
    if(players.has(socket.id))return;
    players.set(socket.id,makePlayer(socket.id,String(d?.name||"Desi Player").slice(0,16)));
    socket.emit("joined");
  });

  socket.on("input",d=>{
    const p=players.get(socket.id);if(!p||!p.alive)return;
    let dx=Number(d?.dx)||0,dz=Number(d?.dz)||0,n=Math.hypot(dx,dz)||1;
    if(n>1){dx/=n;dz/=n}
    p.dx=dx;p.dz=dz;
    let ax=Number(d?.ax)||0,az=Number(d?.az)||-1,an=Math.hypot(ax,az)||1;
    p.ax=ax/an;p.az=az/an;
    if(d?.shoot)shoot(p);
  });

  socket.on("reload",()=>{const p=players.get(socket.id);if(p&&p.alive)p.ammo=30});
  socket.on("heal",()=>{const p=players.get(socket.id);if(p&&p.alive&&p.med>0&&p.hp<100){p.hp=Math.min(100,p.hp+30);p.med--}});
  socket.on("disconnect",()=>players.delete(socket.id));
});

function shoot(p){
  if(p.cool>0||p.ammo<=0)return;
  p.cool=.16;p.ammo--;
  bullets.push({x:p.x+p.ax*2.5,z:p.z+p.az*2.5,vx:p.ax*34,vz:p.az*34,owner:p.id,life:1.2,damage:25});
}

function kill(v,k){
  if(!v.alive)return;
  v.alive=false;
  if(k&&k!==v)k.kills++;
  loot.push({x:v.x,z:v.z,type:Math.random()<.7?"ammo":"med",active:true});
  const alive=[...players.values()].filter(p=>p.alive);
  if(alive.length<=1&&players.size>=2){
    const winner=alive[0];
    for(const s of io.sockets.sockets.values()){
      s.emit("gameover",{win:winner&&winner.id===s.id,text:winner?winner.name+" won the battle!":"Everyone was eliminated."});
    }
  }
}

function update(dt){
  for(const p of players.values()){
    if(!p.alive)continue;
    p.cool=Math.max(0,p.cool-dt);
    const speed=23;
    p.x=clamp(p.x+p.dx*speed*dt,-WORLD.w/2+10,WORLD.w/2-10);
    p.z=clamp(p.z+p.dz*speed*dt,-WORLD.d/2+10,WORLD.d/2-10);

    if(dist(p,safe)>safe.r)p.hp-=7*dt;

    for(const l of loot){
      if(!l.active)continue;
      if(Math.hypot(l.x-p.x,l.z-p.z)<4){
        l.active=false;
        if(l.type==="ammo")p.ammo=Math.min(30,p.ammo+15);
        else p.med=Math.min(3,p.med+1);
      }
    }
    if(p.hp<=0)kill(p,null);
  }

  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    b.x+=b.vx*dt;b.z+=b.vz*dt;b.life-=dt;
    let hit=null;
    for(const p of players.values()){
      if(!p.alive||p.id===b.owner)continue;
      if(Math.hypot(b.x-p.x,b.z-p.z)<3.4){hit=p;break}
    }
    if(hit){
      hit.hp-=b.damage;
      if(hit.hp<=0)kill(hit,players.get(b.owner));
      bullets.splice(i,1);continue;
    }
    if(b.life<=0||Math.abs(b.x)>WORLD.w/2||Math.abs(b.z)>WORLD.d/2)bullets.splice(i,1);
  }

  safe.timer+=dt;
  if(safe.timer>=20){safe.timer=0;safe.target=Math.max(90,safe.target-65)}
  safe.r+=(safe.target-safe.r)*dt*.12;
}

setInterval(()=>{
  update(.05);
  const out={};
  for(const [id,p] of players)out[id]={id,name:p.name,x:p.x,z:p.z,y:p.y,hp:Math.max(0,p.hp),ammo:p.ammo,med:p.med,kills:p.kills,alive:p.alive,ax:p.ax,az:p.az};
  io.emit("state",{players:out,bullets:bullets.map(b=>({x:b.x,z:b.z})),loot:loot.filter(l=>l.active),safe});
},50);

server.listen(PORT,()=>console.log("DESI DROP server running on "+PORT));
