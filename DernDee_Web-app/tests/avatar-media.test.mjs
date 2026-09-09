import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mediaTools = ['ffmpeg', 'ffprobe', 'python3'].every(tool => !spawnSync(tool, ['-version']).error);

test('audio mux preserves every video packet even when audio is shorter', { skip: !mediaTools && 'requires ffmpeg, ffprobe and python3' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-media-test-'));
  try {
    execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=size=64x64:rate=24:duration=1','-c:v','libvpx-vp9','-lag-in-frames','0',join(dir,'silent.webm')]);
    execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','sine=duration=0.1',join(dir,'audio.wav')]);
    const result = execFileSync('python3', ['-c', `import sys
from pathlib import Path
sys.path.insert(0, 'scripts')
from avatar_media import mux_audio, video_packets
root=Path(sys.argv[1])
mux_audio(root/'audio.wav',root/'silent.webm',root/'result.webm','libopus')
print(video_packets(root/'result.webm'))`,dir], {encoding:'utf8'});
    assert.equal(Number(result.trim()),24);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test('shipped avatar WebMs have video packets covering their full duration', { skip: !mediaTools && 'requires ffprobe' }, () => {
  for (const name of readdirSync('public/Avatar/video').filter(name => name.endsWith('.webm'))) {
    const data = JSON.parse(execFileSync('ffprobe', ['-v','error','-count_packets','-select_streams','v:0','-show_entries','stream=nb_read_packets,avg_frame_rate:format=duration','-of','json',`public/Avatar/video/${name}`], {encoding:'utf8'}));
    const [n,d] = data.streams[0].avg_frame_rate.split('/').map(Number);
    const minimum = Math.floor(Number(data.format.duration) * n / d) - 4;
    assert.ok(Number(data.streams[0].nb_read_packets) >= minimum, `${name}: truncated video`);
  }
});
