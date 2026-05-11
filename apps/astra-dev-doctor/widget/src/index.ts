import {createPanel} from './DoctorPanel';
import {initialize} from './doctor-sdk';

const sidecarUrl =
  (window as Window & {__DOCTOR_URL__?: string}).__DOCTOR_URL__ ?? 'http://localhost:3999';

initialize(sidecarUrl);

const host = document.createElement('div');
host.id = 'ids-doctor-host';
document.body.appendChild(host);
const shadow = host.attachShadow({mode: 'open'});
createPanel(shadow);
