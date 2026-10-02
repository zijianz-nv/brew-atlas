/** Heavy placement is independent from the per-frame geographic visibility guard. */
export function createCameraLayoutScheduler({onLayout,onReentry,setTimer=setTimeout,clearTimer=clearTimeout,
  settleMs=220,rotationMs=1800,reentryMs=900}={}) {
  let settled=null,rotating=null,reentry=null,enabled=true;
  const cancel=key=>{if(key!==null)clearTimer(key);return null;};
  const stop=()=>{settled=cancel(settled);rotating=cancel(rotating);reentry=cancel(reentry);};
  return {
    move({autoRotate=false}={}){
      if(!enabled)return;
      settled=cancel(settled);reentry=cancel(reentry);
      if(autoRotate){
        // Auto rotation never becomes idle. Refresh occasionally to admit beers
        // entering the hemisphere, without blocking every few animation frames.
        if(rotating===null)rotating=setTimer(()=>{rotating=null;if(enabled)onLayout();},rotationMs);
      }else{
        rotating=cancel(rotating);
        settled=setTimer(()=>{settled=null;if(enabled)onLayout();},settleMs);
      }
      reentry=setTimer(()=>{reentry=null;if(enabled)onReentry?.();},reentryMs);
    },
    setEnabled(value){enabled=Boolean(value);if(!enabled)stop();},
    dispose:stop,
  };
}
