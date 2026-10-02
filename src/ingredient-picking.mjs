import {Raycaster,Sphere,Vector2,Vector3} from 'three';

export function consumeIngredientEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  if(event?.nativeEvent&&event.nativeEvent!==event)consumeIngredientEvent(event.nativeEvent);
}

/** Recheck actual meshes at click time; hover raycasts may lag fast touch taps. */
export function ingredientAtPointer({event,rect,camera,adapters,globeRadius}) {
  if(!rect?.width||!rect?.height||!Number.isFinite(event?.clientX)||!Number.isFinite(event?.clientY))return null;
  const x=(event.clientX-rect.left)/rect.width*2-1,y=1-(event.clientY-rect.top)/rect.height*2;
  if(Math.abs(x)>1||Math.abs(y)>1)return null;
  camera.updateMatrixWorld();
  const roots=adapters.filter(root=>root?.visible&&root.parent);
  for(const root of roots)root.updateWorldMatrix(true,true);
  const raycaster=new Raycaster();raycaster.setFromCamera(new Vector2(x,y),camera);
  const surface=raycaster.ray.intersectSphere(new Sphere(new Vector3(),globeRadius),new Vector3());
  const surfaceDistance=surface?surface.distanceTo(raycaster.ray.origin):Infinity;
  for(const hit of raycaster.intersectObjects(roots,true)){
    // The front of the actual earth occludes fields on the other hemisphere.
    if(hit.distance>surfaceDistance+0.001)continue;
    for(let object=hit.object;object;object=object.parent)if(object.userData.regionId)return object.userData.regionId;
  }
  return null;
}
