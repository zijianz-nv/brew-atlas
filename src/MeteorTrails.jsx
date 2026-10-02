import React, {memo} from 'react';
import './meteor-trails.css';

function MeteorTrails() {
  return <div className="meteor-trails" aria-hidden="true">
    <i className="meteor-trail"/>
    <i className="meteor-trail"/>
    <i className="meteor-trail"/>
  </div>;
}

export default memo(MeteorTrails);
