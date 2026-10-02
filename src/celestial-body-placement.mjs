/** Screen-space illustration layout, not astronomical coordinates.
 * Bodies: {id/name,x,y,width,height}; x/y are occupied-box centers, with labels
 * included in width/height. Exclusions: {x,y,width,height}, x/y top-left.
 * Optional bounds contain the complete occupied box: a rectangle uses top-left
 * x/y and width/height, while a circle uses center x/y and radius.
 * Run in useMemo when layout/viewport changes, never per animation frame.
 * Only render placed:true entries: an impossible fit returns null coordinates.
 */
export function constellationInteriorBounds({constellations=[],width,centerY,gap=0}={}){
  if(!constellations.length)return null;
  if(width>=600){
    const radius=Math.min(...constellations.map(s=>Math.hypot(s.x+s.width/2-width/2,s.y+s.height/2-centerY)))-gap;
    return radius>0?{type:'circle',x:width/2,y:centerY,radius}:null;
  }
  const row=name=>constellations.filter(s=>s.layoutRow===name);
  const left=row('left'),right=row('right'),top=row('top'),bottom=row('bottom');
  if([left,right,top,bottom].some(items=>!items.length))return null;
  const x=Math.max(...left.map(s=>s.x+s.width))+gap,y=Math.max(...top.map(s=>s.y+s.height))+gap;
  const endX=Math.min(...right.map(s=>s.x))-gap,endY=Math.min(...bottom.map(s=>s.y))-gap;
  return endX>x&&endY>y?{type:'rectangle',x,y,width:endX-x,height:endY-y}:null;
}

// Spread visual weight above and below Earth before collision placement. These
// are decorative overview anchors, never changes to the surrounding stars.
export function balancedOverviewBodies(bodies,bounds){
  if(!bounds)return bodies;
  const circle=bounds.type==='circle',cx=circle?bounds.x:bounds.x+bounds.width/2,
    cy=circle?bounds.y:bounds.y+bounds.height/2,rx=circle?bounds.radius:bounds.width/2,
    ry=circle?bounds.radius:bounds.height/2;
  const anchors={SUN:[-.65,-.68],MOON:[-.72,-.12],MARS:[.72,.16],
    MERCURY:[.06,-.87],VENUS:[.7,-.62],JUPITER:[-.48,.78],
    SATURN:[.52,.78],URANUS:[-.76,.42],NEPTUNE:[.05,.91]};
  return bodies.map(body=>{const anchor=anchors[body.name];return anchor?{...body,x:cx+anchor[0]*rx,y:cy+anchor[1]*ry}:body;});
}

export function placeCelestialBodies({bodies=[],exclusions=[],width,height,gap=8,padding=6,bounds}={}){
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||!Number.isFinite(gap)||gap<0||!Number.isFinite(padding)||padding<0)throw new RangeError('Positive viewport and nonnegative spacing required');
  const validRect=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;
  if(!bodies.every(validRect)||!exclusions.every(validRect))throw new RangeError('Finite positions and positive occupied rectangles required');
  const circle=bounds?.type==='circle'?bounds:null;
  if(bounds&&!(bounds.type==='rectangle'&&validRect(bounds))&&!(circle&&['x','y','radius'].every(k=>Number.isFinite(circle[k]))&&circle.radius>0))throw new RangeError('Valid rectangle or circle bounds required');
  const blocked=exclusions.map(r=>({...r})),result=new Array(bodies.length);
  const priority=b=>({SUN:3,MOON:2,MARS:1}[String(b.name??b.id??'').toUpperCase()]??0);
  const ordered=bodies.map((body,index)=>({body,index})).sort((a,b)=>priority(b.body)-priority(a.body)||b.body.width*b.body.height-a.body.width*a.body.height||a.index-b.index);
  for(const {body,index}of ordered){
    const hw=body.width/2,hh=body.height/2;
    const minX=Math.max(padding,bounds?(circle?circle.x-circle.radius:bounds.x):0)+hw;
    const maxX=Math.min(width-padding,bounds?(circle?circle.x+circle.radius:bounds.x+bounds.width):width)-hw;
    const minY=Math.max(padding,bounds?(circle?circle.y-circle.radius:bounds.y):0)+hh;
    const maxY=Math.min(height-padding,bounds?(circle?circle.y+circle.radius:bounds.y+bounds.height):height)-hh;
    let best=null,bestDistance=Infinity;
    if(minX<=maxX&&minY<=maxY){
      // Expand obstacles by this body's half-size. The closest legal center
      // lies at the original center, a boundary projection, or their corners.
      const forbidden=blocked.map(r=>({left:r.x-hw-gap,right:r.x+r.width+hw+gap,top:r.y-hh-gap,bottom:r.y+r.height+hh+gap}));
      const xs=[...new Set([Math.max(minX,Math.min(maxX,body.x)),minX,maxX,...forbidden.flatMap(r=>[r.left,r.right])])].filter(x=>x>=minX&&x<=maxX);
      const ys=[...new Set([Math.max(minY,Math.min(maxY,body.y)),minY,maxY,...forbidden.flatMap(r=>[r.top,r.bottom])])].filter(y=>y>=minY&&y<=maxY);
      if(circle){
        xs.push(circle.x);ys.push(circle.y);
        // Circle/obstacle intersections provide legal candidates even when all
        // rectangular projections fall outside the constellation ring.
        for(const y of [...ys]){
          const squared=circle.radius**2-(Math.abs(y-circle.y)+hh)**2;
          if(squared<0)continue;
          const reach=Math.sqrt(squared)-hw;
          if(reach>=0)xs.push(circle.x-reach,circle.x+reach);
        }
        for(const x of [...xs]){
          const squared=circle.radius**2-(Math.abs(x-circle.x)+hw)**2;
          if(squared<0)continue;
          const reach=Math.sqrt(squared)-hh;
          if(reach>=0)ys.push(circle.y-reach,circle.y+reach);
        }
      }
      for(const x of xs)for(const y of ys){
        const distance=(x-body.x)**2+(y-body.y)**2;
        if(x<minX||x>maxX||y<minY||y>maxY)continue;
        if(circle&&(Math.abs(x-circle.x)+hw)**2+(Math.abs(y-circle.y)+hh)**2>circle.radius**2+1e-7)continue;
        if(distance>=bestDistance||forbidden.some(r=>x>r.left&&x<r.right&&y>r.top&&y<r.bottom))continue;
        best={x,y};bestDistance=distance;
      }
    }
    if(!best){result[index]={...body,x:null,y:null,placed:false,moved:false,dx:null,dy:null};continue;}
    result[index]={...body,...best,placed:true,moved:bestDistance>0,dx:best.x-body.x,dy:best.y-body.y};
    blocked.push({x:best.x-hw,y:best.y-hh,width:body.width,height:body.height});
  }
  return result;
}
