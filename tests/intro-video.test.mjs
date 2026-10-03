import assert from 'node:assert/strict';
import {validateIntroVideo, IntroVideoError, MAX_INTRO_VIDEO_BYTES, MAX_INTRO_VIDEO_SECONDS} from '../api/_intro-video.mjs';
import {makeIntroVideo, makeAudioIntroVideo} from './intro-video-fixtures.mjs';

const location = (bytes, type, nth = 0) => {
  if (type === 'avc1') nth++; // the compatible-brand list contains the first occurrence
  let index = -1;
  for (let n = 0; n <= nth; n++) index = bytes.indexOf(type, index + 1);
  assert.ok(index >= 4, `fixture contains ${type}`);
  return index + 4;
};
const invalid = (bytes, label, code) => assert.throws(() => validateIntroVideo(bytes), error => {
  assert.ok(error instanceof IntroVideoError, `${label}: all invalid media errors are public/typed`);
  if (code) assert.equal(error.code, code, label);
  return true;
}, label);
const change = (label, mutate, factory = makeIntroVideo) => { const bytes = factory(); mutate(bytes); invalid(bytes, label); };
const put = (bytes, type, offset, value, nth = 0) => bytes.writeUInt32BE(value, location(bytes, type, nth) + offset);

assert.equal(MAX_INTRO_VIDEO_BYTES, 2 * 1024 * 1024);
assert.equal(MAX_INTRO_VIDEO_SECONDS, 15);
for (const factory of [makeIntroVideo, makeAudioIntroVideo]) {
  const input = factory(), unchanged = Buffer.from(input), result = validateIntroVideo(input);
  assert.equal(result.mimeType, 'video/mp4');
  assert.equal(result.durationMs, 1000);
  assert.equal(result.sizeBytes, input.length);
  assert.equal(result.width, 32);
  assert.equal(result.height, 32);
  assert.deepEqual(result.bytes, input, 'storage bytes are exactly those validated');
  assert.notEqual(result.bytes, input, 'validated bytes have independent ownership');
  assert.deepEqual(input, unchanged, 'validation does not mutate input');
  input.fill(0);
  assert.deepEqual(result.bytes, unchanged, 'caller mutation cannot replace validated bytes');
}
for (const input of [null, undefined, '', {}, [], new Uint8Array(200), Buffer.alloc(0), Buffer.alloc(200)]) invalid(input, 'invalid input');
invalid(Buffer.alloc(MAX_INTRO_VIDEO_BYTES + 1), 'oversized input', 'video_too_large');
// Appending a valid padding atom reaches the exact size boundary without changing media.
const exactSize = Buffer.alloc(MAX_INTRO_VIDEO_BYTES), tiny = makeIntroVideo();
tiny.copy(exactSize); exactSize.writeUInt32BE(exactSize.length - tiny.length, tiny.length); exactSize.write('free', tiny.length + 4);
assert.equal(validateIntroVideo(exactSize).sizeBytes, MAX_INTRO_VIDEO_BYTES);
for (let length = 0; length < tiny.length; length++) invalid(tiny.subarray(0, length), `truncation at ${length}`);

// Slow the actual sample timeline to exactly 15 seconds, including composition
// offsets and encoder-delay edit. Movie/track headers alone cannot pass this test.
function fifteenSeconds() {
  const bytes = makeIntroVideo();
  for (const [type, offset] of [['mvhd', 16], ['tkhd', 20], ['mdhd', 16], ['elst', 8], ['elst', 12]]) {
    const at = location(bytes, type) + offset; bytes.writeUInt32BE(bytes.readUInt32BE(at) * 15, at);
  }
  for (const type of ['stts', 'ctts']) {
    const at = location(bytes, type), entries = bytes.readUInt32BE(at + 4);
    for (let n = 0; n < entries; n++) bytes.writeUInt32BE(bytes.readUInt32BE(at + 12 + n * 8) * 15, at + 12 + n * 8);
  }
  return bytes;
}
assert.equal(validateIntroVideo(fifteenSeconds()).durationMs, 15000, 'exact 15-second sample timeline accepted');
const tooLong = fifteenSeconds();
put(tooLong, 'stts', 12, tooLong.readUInt32BE(location(tooLong, 'stts') + 12) + 1);
put(tooLong, 'mdhd', 16, tooLong.readUInt32BE(location(tooLong, 'mdhd') + 16) + 10);
invalid(tooLong, 'one extra media tick is not given tolerance', 'video_too_long');
for (const [type, offset] of [['mvhd', 16], ['tkhd', 20], ['elst', 8]]) put(tooLong, type, offset, 1000);
invalid(tooLong, 'short movie/track/edit claims cannot hide long samples', 'video_too_long');
change('false mdhd duration', bytes => put(bytes, 'mdhd', 16, 1));
change('zero movie timescale', bytes => put(bytes, 'mvhd', 12, 0));
change('zero media timescale', bytes => put(bytes, 'mdhd', 12, 0));
change('zero sample duration', bytes => put(bytes, 'stts', 12, 0));
change('zero sample count', bytes => put(bytes, 'stsz', 8, 0));
change('too many samples', bytes => put(bytes, 'stsz', 8, 901));
change('time table count mismatch', bytes => put(bytes, 'stts', 8, 9));
change('composition table count mismatch', bytes => put(bytes, 'ctts', 8, 2));
change('composition offset overflow', bytes => put(bytes, 'ctts', 12, 0x7fffffff));
change('excessive frame rate', bytes => { put(bytes, 'stts', 12, 1); put(bytes, 'mdhd', 16, 10); });
change('slowed movie rate', bytes => put(bytes, 'mvhd', 20, 0x8000));
change('slowed edit rate', bytes => put(bytes, 'elst', 16, 0x8000));
change('negative/empty edit', bytes => put(bytes, 'elst', 12, 0xffffffff));
change('multiple edits', bytes => put(bytes, 'elst', 4, 2));
change('an edit cannot hide the first fifteen seconds of thirty seconds of media', bytes => {
  const scale = bytes.readUInt32BE(location(bytes, 'mdhd') + 12);
  put(bytes, 'mdhd', 16, 30 * scale); put(bytes, 'stts', 12, 3 * scale);
  const at = location(bytes, 'ctts'), entries = bytes.readUInt32BE(at + 4);
  for (let n = 0; n < entries; n++) bytes.writeUInt32BE(0, at + 12 + n * 8);
  put(bytes, 'elst', 12, 15 * scale); put(bytes, 'elst', 8, 15000);
});
change('negative composition offsets cannot conceal thirty seconds of decode time', bytes => {
  const scale = bytes.readUInt32BE(location(bytes, 'mdhd') + 12);
  put(bytes, 'mdhd', 16, 30 * scale); put(bytes, 'stts', 12, 3 * scale);
  const at = location(bytes, 'ctts'), entries = bytes.readUInt32BE(at + 4); bytes[at] = 1;
  for (let n = 0; n < entries; n++) bytes.writeInt32BE(n < 5 ? 0 : -15 * scale, at + 12 + n * 8);
  put(bytes, 'elst', 12, 0); put(bytes, 'elst', 8, 15000);
});

change('unknown major brand', bytes => bytes.write('html', location(bytes, 'ftyp')));
change('renamed WebM is not MP4', bytes => bytes.writeUInt32BE(0x1a45dfa3, 0));
change('zero-size atom rejected', bytes => bytes.writeUInt32BE(0, 0));
change('box escapes file', bytes => bytes.writeUInt32BE(0xffffffff, 0));
change('unsafe 64-bit atom length', bytes => { bytes.writeUInt32BE(1, 0); bytes.writeBigUInt64BE(0xffffffffffffffffn, 8); });
change('fragmented media rejected', bytes => bytes.write('moof', location(bytes, 'moov') - 4));
change('unregistered track type', bytes => bytes.write('text', location(bytes, 'hdlr') + 8));
change('HEVC rejected', bytes => bytes.write('hvc1', location(bytes, 'avc1') - 4));
change('encrypted codec rejected', bytes => bytes.write('encv', location(bytes, 'avc1') - 4));
change('external data reference rejected', bytes => put(bytes, 'url ', 0, 0));
change('unresolved sample data reference', bytes => bytes.writeUInt16BE(2, location(bytes, 'avc1') + 6));
change('oversized claimed dimensions', bytes => bytes.writeUInt16BE(1281, location(bytes, 'avc1') + 24));
change('SPS/description dimension disagreement', bytes => bytes.writeUInt16BE(31, location(bytes, 'avc1') + 24));
change('invalid SPS parameter count', bytes => { bytes[location(bytes, 'avcC') + 5] = 0xe0; });
change('invalid SPS data', bytes => { bytes[location(bytes, 'avcC') + 8] = 0x68; });
change('unsupported AVC profile', bytes => { bytes[location(bytes, 'avcC') + 9] = 244; });
change('invalid NAL length size', bytes => { bytes[location(bytes, 'avcC') + 4] = 0xfe; });
change('empty sample', bytes => put(bytes, 'stsz', 12, 0));
change('sample escapes mdat', bytes => put(bytes, 'stsz', 12, 0x100000));
change('chunk outside file', bytes => put(bytes, 'stco', 8, bytes.length));
change('chunk points into metadata', bytes => put(bytes, 'stco', 8, location(bytes, 'moov')));
change('chunk map starts after first', bytes => put(bytes, 'stsc', 8, 2));
change('chunk sample count mismatch', bytes => put(bytes, 'stsc', 12, 9));
change('invalid chunk sample description', bytes => put(bytes, 'stsc', 16, 2));
change('invalid sync sample', bytes => put(bytes, 'stss', 8, 11));
change('NAL length escapes sample', bytes => { const at = bytes.readUInt32BE(location(bytes, 'stco') + 8); bytes.writeUInt32BE(0xffffffff, at); });
change('in-band parameter replacement rejected', bytes => { const at = bytes.readUInt32BE(location(bytes, 'stco') + 8); bytes[at + 4] = 0x67; });
change('forbidden NAL bit', bytes => { const at = bytes.readUInt32BE(location(bytes, 'stco') + 8); bytes[at + 4] |= 0x80; });
change('slice cannot reference an undeclared picture parameter set', bytes => {
  let cursor = bytes.readUInt32BE(location(bytes, 'stco') + 8);
  const end = cursor + bytes.readUInt32BE(location(bytes, 'stsz') + 12);
  while (cursor < end) {
    const size = bytes.readUInt32BE(cursor), type = bytes[cursor + 4] & 31;
    if (type === 1 || type === 5) { bytes[cursor + 5] = 0xd0; return; } // ue(0), ue(0), ue(1)
    cursor += 4 + size;
  }
  assert.fail('fixture must contain a slice');
});

change('audio track cannot be video', bytes => bytes.write('vide', location(bytes, 'hdlr', 1) + 8), makeAudioIntroVideo);
change('AAC cannot use an external ES URL', bytes => { const at = location(bytes, 'esds'); bytes[at + 11] = 0x40; }, makeAudioIntroVideo);
change('encrypted sample group rejected', bytes => bytes.write('seig', location(bytes, 'sgpd') + 4), makeAudioIntroVideo);
change('overlapping chunks rejected', bytes => {
  put(bytes, 'stco', 12, bytes.readUInt32BE(location(bytes, 'stco') + 8), 1);
}, makeAudioIntroVideo);
change('audio sample-count mismatch', bytes => put(bytes, 'stts', 8, 46, 1), makeAudioIntroVideo);
change('AAC edit cannot conceal more than encoder delay', bytes => put(bytes, 'elst', 12, 2048, 1), makeAudioIntroVideo);

// Corrupt headers/counts must never leak Buffer RangeError/TypeError to callers.
// Mutations that only change irrelevant metadata may legitimately still validate.
for (let n = 0; n < 400; n++) {
  const bytes = makeAudioIntroVideo(), at = (n * 701 + 17) % (bytes.length - 4);
  bytes.writeUInt32BE((n * 2654435761) >>> 0, at);
  try { validateIntroVideo(bytes); } catch (error) { assert.ok(error instanceof IntroVideoError, `typed failure for mutation ${n}`); }
}
console.log('Intro video: real H264/AAC fixtures, strict sample-derived 15s/2MiB bounds, structural corruption, safe ownership, codec/dimensions, references and byte ranges pass.');
