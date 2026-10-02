import {APP_BASE_URL,withBasePath} from './base-path.mjs';

export function createIngredientMarker(region,onSelect,existing) {
  const element=existing||document.createElement('div');
  element.className='globe-ingredient-marker';
  element.dataset.ingredientId=region.id;element._ingredientRegion=region;
  if(!existing)element.style.visibility='hidden';
  let button=element.firstElementChild;
  if(!button){button=document.createElement('button');button.type='button';button.className='globe-ingredient';element.append(button);}
  if(button.dataset.type!==region.type){button.dataset.type=region.type;button.replaceChildren();const image=document.createElement('img');image.src=withBasePath('/images/ingredients/'+region.type+'.png',APP_BASE_URL);image.alt='';image.width=48;image.height=64;image.decoding='async';button.append(image,document.createElement('span'));}
  button.lastElementChild.textContent='';
  button.setAttribute('aria-label',`${region.nameZh} · ${region.typeLabel||region.type}种植产区`);
  button.title=`${region.nameZh} · ${region.typeLabel||region.type}`;
  button.onclick=event=>{event.stopPropagation();onSelect?.(region);};
  element.onpointerdown=event=>event.stopPropagation();element.onpointerup=event=>event.stopPropagation();
  return element;
}

/** Ingredient marks yield to every beer photo; they never consume photo slots. */
export function cullIngredientMarkers(wrapper,elements,project) {
  if(!wrapper||!elements.size)return;
  const bounds=wrapper.getBoundingClientRect(),compact=bounds.width<600,w=compact?30:36,h=compact?37:43;
  const boxes=[...wrapper.querySelectorAll('.globe-bottle')].filter(node=>node._wasVisible&&node.closest('[data-marker-id]')?._visible!==false)
    .map(node=>node.getBoundingClientRect());
  const shell=wrapper.closest('.app');
  if(shell)boxes.push(...[...shell.querySelectorAll('.globe-tools,.map-summary,.map-hint,.filter-dock,.inspector,.ingredient-panel')]
    .filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect()));
  const intersects=(a,b)=>a.left<b.right+3&&a.right>b.left-3&&a.top<b.bottom+3&&a.bottom>b.top-3;
  for(const element of elements.values()){
    const region=element._ingredientRegion,p=project(region.lat,region.lng);
    const box={left:bounds.left+p.x-w/2,right:bounds.left+p.x+w/2,top:bounds.top+p.y-h/2,bottom:bounds.top+p.y+h/2};
    const visible=p.visible!==false&&p.x>w/2&&p.x<bounds.width-w/2&&p.y>h/2&&p.y<bounds.height-h/2&&!boxes.some(other=>intersects(box,other));
    element._ingredientVisible=visible;element.style.visibility=visible?'visible':'hidden';
    element.style.pointerEvents=visible?'':'none';element.setAttribute('aria-hidden',String(!visible));
    if(visible)boxes.push(box);
  }
}
