'use strict';

const assert = require('node:assert/strict');
const { ObsService } = require('../electron/obs-service.cjs');

async function main() {
  const service = new ObsService({ onEvent() {}, log() {} });
  const calls = [];
  service.request = async (requestType, requestData = {}) => {
    calls.push({ requestType, requestData });
    if (requestType === 'GetInputMute') return { inputMuted: false };
    if (requestType === 'GetSceneItemEnabled') return { sceneItemEnabled: true };
    if (requestType === 'GetSourceFilter') return { filterEnabled: false };
    return {};
  };

  await service.action('recordToggle');
  assert.equal(calls.at(-1).requestType, 'ToggleRecord');

  await service.action('inputMuteToggle', { inputName: 'Mic/Aux' });
  assert.deepEqual(calls.slice(-2), [
    { requestType: 'GetInputMute', requestData: { inputName: 'Mic/Aux' } },
    { requestType: 'SetInputMute', requestData: { inputName: 'Mic/Aux', inputMuted: true } },
  ]);

  await service.action('sourceVisibilityToggle', { sceneItemRef: JSON.stringify(['Juego', 7]) });
  assert.deepEqual(calls.at(-1), { requestType: 'SetSceneItemEnabled', requestData: { sceneName: 'Juego', sceneItemId: 7, sceneItemEnabled: false } });

  await service.action('filterToggle', { filterRef: JSON.stringify(['Cámara', 'Chroma']) });
  assert.deepEqual(calls.at(-1), { requestType: 'SetSourceFilterEnabled', requestData: { sourceName: 'Cámara', filterName: 'Chroma', filterEnabled: true } });

  await service.action('transition', { transitionName: 'Fade', transitionDuration: 450 });
  assert.deepEqual(calls.slice(-2), [
    { requestType: 'SetCurrentSceneTransition', requestData: { transitionName: 'Fade' } },
    { requestType: 'SetCurrentSceneTransitionDuration', requestData: { transitionDuration: 450 } },
  ]);

  await assert.rejects(() => service.action('scene', {}), /escena.*obligatori/i);
  await assert.rejects(() => service.action('unknown'), /no compatible/i);
  process.stdout.write(`OBS_SERVICE_OK requests=${calls.length}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
