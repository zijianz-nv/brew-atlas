/** Screen-space illustration layout, not astronomical coordinates.
 * Bodies: {id/name,x,y,width,height}; x/y are occupied-box centers, with labels
 * included in width/height. Exclusions: {x,y,width,height}, x/y top-left.
 * Run in useMemo when layout/viewport changes, never per animation frame.
 * Only render placed:true entries: an impossible fit returns null coordinates.
 */
export function placeCelestialBodies({bodies=[],exclusions=[],width,height,gap=8,padding=6}={}){
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||!Number.isFinite(gap)||gap<0||!Number.isFinite(padding)||padding<0)throw new RangeError('Positive viewport and nonnegative spacing required');
  const validRect=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;
  if(!bodies.every(validRect)||!exclusions.every(validRect))throw new RangeError('Finite positions and positive occupied rectangles required');
  const blocked=exclusions.map(r=>({...r})),result=new Array(bodies.length);
  const priority=b=>({SUN:3,MOON:2,MARS:1}[String(b.name??b.id??'').toUpperCase()]??0);
  const ordered=bodies.map((body,index)=>({body,index})).sort((a,b)=>priority(b.body)-priority(a.body)||b.body.width*b.body.height-a.body.width*a.body.height||a.index-b.index);
  for(const {body,index}of ordered){
    const hw=body.width/2,hh=body.height/2,minX=padding+hw,maxX=width-padding-hw,minY=padding+hh,maxY=height-padding-hh;
    let best=null,bestDistance=Infinity;
    if(minX<=maxX&&minY<=maxY){
      // Expand obstacles by this body's half-size. The closest legal center
      // lies at the original center, a boundary projection, or their corners.
      const forbidden=blocked.map(r=>({left:r.x-hw-gap,right:r.x+r.width+hw+gap,top:r.y-hh-gap,bottom:r.y+r.height+hh+gap}));
      const xs=[...new Set([Math.max(minX,Math.min(maxX,body.x)),minX,maxX,...forbidden.flatMap(r=>[r.left,r.right])])].filter(x=>x>=minX&&x<=maxX);
      const ys=[...new Set([Math.max(minY,Math.min(maxY,body.y)),minY,maxY,...forbidden.flatMap(r=>[r.top,r.bottom])])].filter(y=>y>=minY&&y<=maxY);
      for(const x of xs)for(const y of ys){
        const distance=(x-body.x)**2+(y-body.y)**2;
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
