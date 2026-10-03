// Deliberately narrow ISO-BMFF reader for short, self-contained AVC/AAC MP4s.
// Duration comes from sample timing, composition offsets and a single normal-rate
// edit, not a filename, browser field, mvhd or mdhd assertion. This is structural
// validation, not a decoder, transcoder, content moderator or malware scanner.
// Format reference: https://developer.apple.com/documentation/quicktime-file-format/sample_atoms
export const MAX_INTRO_VIDEO_BYTES = 2 * 1024 * 1024;
export const MAX_INTRO_VIDEO_SECONDS = 15;
const MAX_SAMPLES = 1500;
const MAX_BOXES = 2048;
const FORMAT_ERROR = 'Choose a self-contained H.264 MP4 with optional AAC audio, up to 15 seconds and 2 MiB.';

export class IntroVideoError extends Error {
  constructor(message = FORMAT_ERROR, code = 'invalid_video', status = 400) {
    super(message);
    this.name = 'IntroVideoError';
    this.code = code;
    this.status = status;
  }
}
const reject = () => { throw new IntroVideoError(); };
const check = condition => { if (!condition) reject(); };
const withinSize = (width, height) => Number.isInteger(width) && Number.isInteger(height) &&
  width > 0 && height > 0 && Math.max(width, height) <= 1280 && Math.min(width, height) <= 720;

class Bits {
  constructor(bytes) { this.bytes = bytes; this.pos = 0; }
  get remaining() { return this.bytes.length * 8 - this.pos; }
  read(count = 1) {
    check(Number.isInteger(count) && count >= 0 && count <= 32 && this.remaining >= count);
    let value = 0;
    while (count--) { value = value * 2 + ((this.bytes[this.pos >> 3] >> (7 - (this.pos & 7))) & 1); this.pos++; }
    return value;
  }
  ue() {
    let zeros = 0;
    while (this.read() === 0) { zeros++; check(zeros <= 20); }
    return 2 ** zeros - 1 + this.read(zeros);
  }
  se() { const value = this.ue(); return value & 1 ? (value + 1) / 2 : -value / 2; }
}

function rbsp(nal, type, maximum = 1024) {
  check(nal.length > 1 && nal.length <= maximum && (nal[0] & 0x80) === 0 && (nal[0] & 31) === type);
  const result = [];
  for (let i = 1; i < nal.length; i++) {
    if (i >= 3 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) {
      check(i + 1 < nal.length && nal[i + 1] <= 3);
    } else result.push(nal[i]);
  }
  return new Bits(Buffer.from(result));
}

function sequenceParameterSet(nal) {
  const bits = rbsp(nal, 7), profile = bits.read(8);
  check([66, 77, 88, 100].includes(profile));
  check((bits.read(8) & 3) === 0);
  check(bits.read(8) <= 42);
  const id = bits.ue(); check(id <= 31);
  if (profile === 100) {
    check(bits.ue() === 1 && bits.ue() === 0 && bits.ue() === 0); // 8-bit 4:2:0
    bits.read();
    if (bits.read()) for (let n = 0; n < 8; n++) {
      if (!bits.read()) continue;
      let last = 8, next = 8;
      for (let i = 0; i < (n < 6 ? 16 : 64); i++) {
        if (next !== 0) next = (last + bits.se() + 256) % 256;
        last = next === 0 ? last : next;
      }
    }
  }
  check(bits.ue() <= 12);
  const order = bits.ue(); check(order <= 2);
  if (order === 0) check(bits.ue() <= 12);
  if (order === 1) {
    bits.read(); bits.se(); bits.se();
    const count = bits.ue(); check(count <= 255);
    for (let i = 0; i < count; i++) bits.se();
  }
  check(bits.ue() <= 16); bits.read();
  const columns = bits.ue() + 1, rows = bits.ue() + 1;
  check(columns <= 80 && rows <= 80);
  const frameOnly = bits.read(); if (!frameOnly) bits.read();
  bits.read();
  let left = 0, right = 0, top = 0, bottom = 0;
  if (bits.read()) { left = bits.ue(); right = bits.ue(); top = bits.ue(); bottom = bits.ue(); }
  const width = columns * 16 - (left + right) * 2;
  const height = (2 - frameOnly) * rows * 16 - (top + bottom) * 2 * (2 - frameOnly);
  check(withinSize(width, height));
  return {id, width, height};
}

function avcConfiguration(data, width, height) {
  check(data.length >= 7 && data[0] === 1 && (data[4] & 0xfc) === 0xfc && (data[5] & 0xe0) === 0xe0);
  const lengthBytes = (data[4] & 3) + 1; check([1, 2, 4].includes(lengthBytes));
  let cursor = 6;
  const readNal = () => {
    check(cursor + 2 <= data.length);
    const size = data.readUInt16BE(cursor); cursor += 2;
    check(size > 0 && cursor + size <= data.length);
    const nal = data.subarray(cursor, cursor + size); cursor += size; return nal;
  };
  const sequenceCount = data[5] & 31; check(sequenceCount > 0 && sequenceCount <= 8);
  const sequences = new Set();
  for (let i = 0; i < sequenceCount; i++) {
    const sequence = sequenceParameterSet(readNal());
    check(sequence.width === width && sequence.height === height && !sequences.has(sequence.id));
    sequences.add(sequence.id);
  }
  check(cursor < data.length);
  const pictureCount = data[cursor++]; check(pictureCount > 0 && pictureCount <= 32);
  const pictures = new Set();
  for (let i = 0; i < pictureCount; i++) {
    const bits = rbsp(readNal(), 8), id = bits.ue(), sequence = bits.ue();
    check(id <= 255 && sequences.has(sequence) && !pictures.has(id)); pictures.add(id);
  }
  // High-profile extension may specify only the same 8-bit 4:2:0 configuration.
  if (cursor < data.length) {
    check(data[1] === 100 && cursor + 4 === data.length);
    check(data[cursor] === 0xfd && data[cursor + 1] === 0xf8 && data[cursor + 2] === 0xf8 && data[cursor + 3] === 0);
    cursor += 4;
  }
  check(cursor === data.length);
  return {lengthBytes, pictures};
}

function audioConfiguration(data, channels, sampleRate) {
  const descriptor = (start, end) => {
    check(start < end); const tag = data[start++]; let length = 0, count = 0, byte;
    do { check(start < end && count++ < 4); byte = data[start++]; length = length * 128 + (byte & 127); } while (byte & 128);
    check(length > 0 && start + length <= end); return {tag, start, end: start + length};
  };
  const es = descriptor(0, data.length); check(es.tag === 3 && es.end === data.length && es.end - es.start >= 3);
  let cursor = es.start + 2; const flags = data[cursor++];
  // URL and dependent/external ES references are deliberately unsupported.
  check((flags & 0xe0) === 0);
  const decoder = descriptor(cursor, es.end);
  check(decoder.tag === 4 && decoder.end - decoder.start >= 15);
  check(data[decoder.start] === 0x40 && (data[decoder.start + 1] >> 2) === 5);
  const config = descriptor(decoder.start + 13, decoder.end);
  check(config.tag === 5 && config.end === decoder.end && config.end - config.start <= 8);
  const bits = new Bits(data.subarray(config.start, config.end));
  check(bits.read(5) === 2); // AAC-LC only, no SBR or parametric stereo
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  check(rates[bits.read(4)] === sampleRate && sampleRate >= 8000 && sampleRate <= 48000);
  check(bits.read(4) === channels && [1, 2].includes(channels));
  check(bits.read(3) === 0); // standard frame length, no core coder, no extension
  if (bits.remaining >= 17) check(bits.read(11) === 0x2b7 && bits.read(5) === 5 && bits.read() === 0);
  while (bits.remaining) check(bits.read() === 0);
  cursor = decoder.end;
  const sl = descriptor(cursor, es.end); check(sl.tag === 6 && sl.end === es.end && sl.end - sl.start === 1 && data[sl.start] === 2);
}

export function validateIntroVideo(input) {
  if (!Buffer.isBuffer(input)) throw new IntroVideoError();
  if (input.length > MAX_INTRO_VIDEO_BYTES) throw new IntroVideoError('The introduction video must be 2 MiB or smaller.', 'video_too_large', 413);
  check(input.length >= 128);
  // Validate and store this owned snapshot, not a caller-mutable input view.
  const bytes = Buffer.from(input);
  let boxCount = 0;
  const u32 = offset => { check(offset >= 0 && offset + 4 <= bytes.length); return bytes.readUInt32BE(offset); };
  const u64 = offset => { check(offset >= 0 && offset + 8 <= bytes.length); const n = bytes.readBigUInt64BE(offset); check(n <= BigInt(Number.MAX_SAFE_INTEGER)); return Number(n); };
  const boxes = (start, end) => {
    const list = [];
    while (start < end) {
      check(++boxCount <= MAX_BOXES && start + 8 <= end);
      let size = u32(start), header = 8;
      const type = bytes.toString('latin1', start + 4, start + 8);
      if (size === 1) { check(start + 16 <= end); size = u64(start + 8); header = 16; }
      // Ambiguous zero-size nested boxes and trailing fragments are rejected.
      check(size >= header && start + size <= end);
      list.push({type, start, data: start + header, end: start + size}); start += size;
    }
    check(start === end); return list;
  };
  const children = box => boxes(box.data, box.end);
  const one = (list, type, required = true) => { const matches = list.filter(box => box.type === type); check(matches.length <= 1 && (!required || matches.length === 1)); return matches[0]; };
  const only = (list, names) => check(list.every(box => names.includes(box.type)));
  const full = (box, versions = [0]) => { check(box.data + 4 <= box.end && versions.includes(bytes[box.data]) && bytes.readUIntBE(box.data + 1, 3) === 0); return bytes[box.data]; };
  const durationError = () => { throw new IntroVideoError('The introduction video must be 15 seconds or shorter.', 'video_too_long'); };
  const checkDuration = duration => { check(Number.isFinite(duration) && duration > 0); if (duration > MAX_INTRO_VIDEO_SECONDS) durationError(); };
  const top = boxes(0, bytes.length);
  only(top, ['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide']);
  const fileType = one(top, 'ftyp'), movie = one(top, 'moov');
  check(top[0] === fileType && fileType.end - fileType.data >= 8 && (fileType.end - fileType.data) % 4 === 0);
  check(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V '].includes(bytes.toString('latin1', fileType.data, fileType.data + 4)));
  const media = top.filter(box => box.type === 'mdat'); check(media.length > 0 && media.length <= 16);
  const mediaBytes = media.reduce((sum, box) => sum + box.end - box.data, 0);
  let referencedBytes = 0;
  const movieChildren = children(movie); only(movieChildren, ['mvhd', 'trak', 'udta', 'meta']);
  const movieHeader = one(movieChildren, 'mvhd'), movieVersion = full(movieHeader, [0, 1]);
  const timeOffset = movieHeader.data + (movieVersion ? 20 : 12);
  check(movieHeader.end - movieHeader.data >= (movieVersion ? 112 : 100));
  const movieScale = u32(timeOffset); check(movieScale > 0 && movieScale <= 1e9);
  const movieDuration = movieVersion ? u64(timeOffset + 4) : u32(timeOffset + 4);
  checkDuration(movieDuration / movieScale);
  check(u32(timeOffset + (movieVersion ? 12 : 8)) === 0x10000); // no slowed movie rate
  const tracks = movieChildren.filter(box => box.type === 'trak'); check(tracks.length >= 1 && tracks.length <= 2);
  const regions = [], results = [];

  for (const track of tracks) {
    const trackChildren = children(track); only(trackChildren, ['tkhd', 'mdia', 'edts', 'udta']);
    const tkhd = one(trackChildren, 'tkhd');
    check(tkhd.end - tkhd.data >= 84 && [0, 1].includes(bytes[tkhd.data]));
    const tkVersion = bytes[tkhd.data]; check(tkhd.end - tkhd.data >= (tkVersion ? 96 : 84));
    const tkDuration = tkVersion ? u64(tkhd.data + 28) : u32(tkhd.data + 20);
    checkDuration(tkDuration / movieScale);
    const mdia = children(one(trackChildren, 'mdia')); only(mdia, ['mdhd', 'hdlr', 'minf', 'elng']);
    const header = one(mdia, 'mdhd'), version = full(header, [0, 1]);
    check(header.end - header.data >= (version ? 36 : 24));
    const scale = u32(header.data + (version ? 20 : 12)); check(scale > 0 && scale <= 1e9);
    const declaredTicks = version ? u64(header.data + 24) : u32(header.data + 16);
    check(declaredTicks > 0);
    const handler = one(mdia, 'hdlr'); full(handler); check(handler.end - handler.data >= 24);
    const kind = bytes.toString('latin1', handler.data + 8, handler.data + 12); check(['vide', 'soun'].includes(kind));
    const minf = children(one(mdia, 'minf')); only(minf, ['vmhd', 'smhd', 'dinf', 'stbl']);
    const dinf = children(one(minf, 'dinf')); only(dinf, ['dref']);
    const dref = one(dinf, 'dref'); full(dref); check(dref.data + 8 <= dref.end && u32(dref.data + 4) === 1);
    const references = boxes(dref.data + 8, dref.end);
    check(references.length === 1 && references[0].type === 'url ' && references[0].end - references[0].data === 4 && u32(references[0].data) === 1);
    const table = children(one(minf, 'stbl')); only(table, ['stsd', 'stts', 'ctts', 'stsc', 'stsz', 'stco', 'co64', 'stss', 'sdtp', 'sgpd', 'sbgp']);
    const description = one(table, 'stsd'); full(description); check(description.data + 8 <= description.end && u32(description.data + 4) === 1);
    const entries = boxes(description.data + 8, description.end); check(entries.length === 1);
    const entry = entries[0]; check(entry.data + 8 <= entry.end && bytes.readUInt16BE(entry.data + 6) === 1);
    let width = 0, height = 0, audioRate = 0, avc;
    if (kind === 'vide') {
      check(entry.type === 'avc1' && entry.end - entry.data >= 78);
      width = bytes.readUInt16BE(entry.data + 24); height = bytes.readUInt16BE(entry.data + 26);
      check(withinSize(width, height));
      const codec = boxes(entry.data + 78, entry.end); only(codec, ['avcC', 'pasp', 'btrt', 'colr', 'fiel']);
      const config = one(codec, 'avcC'); avc = avcConfiguration(bytes.subarray(config.data, config.end), width, height);
    } else {
      check(entry.type === 'mp4a' && entry.end - entry.data >= 28 && bytes.readUInt16BE(entry.data + 8) === 0);
      const channels = bytes.readUInt16BE(entry.data + 16), sampleRateFixed = u32(entry.data + 24);
      check((sampleRateFixed & 0xffff) === 0 && bytes.readUInt16BE(entry.data + 18) === 16);
      const codec = boxes(entry.data + 28, entry.end); only(codec, ['esds', 'btrt']);
      const config = one(codec, 'esds'); full(config);
      audioRate = sampleRateFixed / 65536;
      audioConfiguration(bytes.subarray(config.data + 4, config.end), channels, audioRate);
    }
    const sampleSize = one(table, 'stsz'); full(sampleSize); check(sampleSize.data + 12 <= sampleSize.end);
    const fixedSize = u32(sampleSize.data + 4), count = u32(sampleSize.data + 8);
    check(count > 0 && count <= (kind === 'vide' ? 900 : MAX_SAMPLES));
    check(sampleSize.end - sampleSize.data === 12 + (fixedSize ? 0 : count * 4));
    const sizes = Array.from({length: count}, (_, index) => fixedSize || u32(sampleSize.data + 12 + index * 4));
    check(sizes.every(size => size > 0 && size <= (kind === 'vide' ? 1024 * 1024 : 8192)));
    // Bound total work before walking any NALs. Repeated chunk references must
    // not amplify a 2 MiB upload into hundreds of MiB of parsing/copying work.
    referencedBytes += sizes.reduce((sum, size) => sum + size, 0);
    check(referencedBytes <= mediaBytes);
    const sync = one(table, 'stss', false);
    if (sync) {
      full(sync); check(sync.data + 8 <= sync.end);
      const entries = u32(sync.data + 4); check(entries > 0 && entries <= count && sync.end - sync.data === 8 + entries * 4);
      let previous = 0;
      for (let n = 0; n < entries; n++) { const index = u32(sync.data + 8 + n * 4); check(index > previous && index <= count); previous = index; }
    }
    const dependency = one(table, 'sdtp', false);
    if (dependency) { full(dependency); check(dependency.end - dependency.data === 4 + count); }
    const groups = one(table, 'sgpd', false), membership = one(table, 'sbgp', false);
    check(Boolean(groups) === Boolean(membership));
    if (groups) {
      // Only AAC's ordinary roll-recovery group is supported, never encryption
      // or other group types that change how samples should be interpreted.
      check(kind === 'soun' && full(groups, [1]) === 1 && groups.end - groups.data === 18);
      check(bytes.toString('latin1', groups.data + 4, groups.data + 8) === 'roll' && u32(groups.data + 8) === 2 && u32(groups.data + 12) === 1);
      check(bytes.readInt16BE(groups.data + 16) >= -1 && bytes.readInt16BE(groups.data + 16) <= 0);
      full(membership); check(membership.end - membership.data === 20);
      check(bytes.toString('latin1', membership.data + 4, membership.data + 8) === 'roll' && u32(membership.data + 8) === 1 && u32(membership.data + 12) === count && u32(membership.data + 16) === 1);
    }
    const readRuns = (type, signed = false) => {
      const box = one(table, type, type === 'stts'); if (!box) return null;
      const v = full(box, signed ? [0, 1] : [0]); check(box.data + 8 <= box.end);
      const entries = u32(box.data + 4); check(entries > 0 && entries <= count && box.end - box.data === 8 + entries * 8);
      const values = [];
      for (let n = 0; n < entries; n++) {
        const repeat = u32(box.data + 8 + n * 8), offset = box.data + 12 + n * 8;
        const value = signed && v === 1 ? bytes.readInt32BE(offset) : u32(offset);
        check(repeat > 0 && values.length + repeat <= count && (signed || value > 0));
        for (let i = 0; i < repeat; i++) values.push(value);
      }
      check(values.length === count); return values;
    };
    const deltas = readRuns('stts'), offsets = readRuns('ctts', true) || new Array(count).fill(0);
    let ticks = 0, earliest = Infinity, latest = 0;
    for (let index = 0; index < count; index++) {
      check(Math.abs(offsets[index]) <= scale * 15);
      earliest = Math.min(earliest, ticks + offsets[index]);
      latest = Math.max(latest, ticks + offsets[index] + deltas[index]); ticks += deltas[index];
      check(Number.isSafeInteger(ticks));
    }
    if (kind === 'vide') {
      check(count * scale <= ticks * 60 && deltas.every(delta => delta * 60 >= scale));
      checkDuration(ticks / scale); // composition offsets cannot hide decode time
    } else {
      check(!table.some(box => box.type === 'ctts'));
      check(deltas.every(delta => delta * audioRate <= scale * 1024));
    }
    check(ticks === declaredTicks); // contradictory media headers fail closed
    let mediaStart = 0, editDuration = 0;
    const edits = one(trackChildren, 'edts', false);
    if (edits) {
      const editBoxes = children(edits); only(editBoxes, ['elst']);
      const edit = one(editBoxes, 'elst'), v = full(edit, [0, 1]);
      check(edit.end - edit.data === (v ? 28 : 20) && u32(edit.data + 4) === 1);
      const duration = v ? u64(edit.data + 8) : u32(edit.data + 8);
      if (v) { const start = bytes.readBigInt64BE(edit.data + 16); check(start >= 0 && start <= BigInt(Number.MAX_SAFE_INTEGER)); mediaStart = Number(start); }
      else mediaStart = bytes.readInt32BE(edit.data + 12);
      check(mediaStart >= 0 && u32(edit.data + (v ? 24 : 16)) === 0x10000);
      // Video edits may remove only the composition lead-in before the first
      // frame; AAC may remove at most its single 1024-sample encoder-delay frame.
      check(kind === 'vide' ? mediaStart === earliest : mediaStart * audioRate <= scale * 1024);
      editDuration = duration / movieScale; checkDuration(editDuration);
    }
    // An edit can account for normal encoder delay, but cannot conceal a long
    // payload by claiming a short segment. Every sample's end is considered.
    const durationSeconds = Math.max((latest - mediaStart) / scale, editDuration, tkDuration / movieScale);
    check(earliest <= mediaStart && latest > mediaStart);
    checkDuration(durationSeconds);
    const chunkOffsets = one(table, 'stco', false) || one(table, 'co64', false);
    check(chunkOffsets && !(table.some(box => box.type === 'stco') && table.some(box => box.type === 'co64')));
    full(chunkOffsets); check(chunkOffsets.data + 8 <= chunkOffsets.end);
    const chunkCount = u32(chunkOffsets.data + 4), wide = chunkOffsets.type === 'co64';
    check(chunkCount > 0 && chunkCount <= count && chunkOffsets.end - chunkOffsets.data === 8 + chunkCount * (wide ? 8 : 4));
    const chunkMap = one(table, 'stsc'); full(chunkMap); check(chunkMap.data + 8 <= chunkMap.end);
    const mapCount = u32(chunkMap.data + 4); check(mapCount > 0 && mapCount <= chunkCount && chunkMap.end - chunkMap.data === 8 + mapCount * 12);
    const mapping = [];
    for (let n = 0; n < mapCount; n++) {
      const start = u32(chunkMap.data + 8 + n * 12), samples = u32(chunkMap.data + 12 + n * 12);
      check(start >= 1 && start <= chunkCount && samples > 0 && samples <= count && u32(chunkMap.data + 16 + n * 12) === 1);
      check(n ? start > mapping[n - 1].start : start === 1); mapping.push({start, samples});
    }
    let sample = 0, map = 0;
    for (let n = 0; n < chunkCount; n++) {
      if (mapping[map + 1]?.start === n + 1) map++;
      let position = wide ? u64(chunkOffsets.data + 8 + n * 8) : u32(chunkOffsets.data + 8 + n * 4);
      const chunkStart = position;
      for (let i = 0; i < mapping[map].samples; i++) {
        check(sample < count); const end = position + sizes[sample++]; check(end <= bytes.length);
        check(media.some(box => position >= box.data && end <= box.end));
        if (kind === 'vide') {
          let cursor = position, units = 0, slices = 0;
          while (cursor < end) {
            check(++units <= 256 && cursor + avc.lengthBytes <= end);
            const size = bytes.readUIntBE(cursor, avc.lengthBytes); cursor += avc.lengthBytes;
            check(size > 0 && cursor + size <= end && (bytes[cursor] & 0x80) === 0);
            const type = bytes[cursor] & 31; check([1, 5, 6, 9, 12].includes(type)); // no in-band parameter replacement
            if (type === 1 || type === 5) {
              const bits = rbsp(bytes.subarray(cursor, cursor + size), type, 1024 * 1024);
              check(bits.ue() < Math.ceil(width / 16) * Math.ceil(height / 16));
              check(bits.ue() <= 9 && avc.pictures.has(bits.ue()));
              slices++;
            }
            cursor += size;
          }
          check(cursor === end && slices > 0);
        }
        position = end;
      }
      regions.push({start: chunkStart, end: position});
    }
    check(sample === count);
    results.push({kind, durationSeconds, width, height});
  }
  const videos = results.filter(track => track.kind === 'vide');
  check(videos.length === 1 && results.filter(track => track.kind === 'soun').length <= 1);
  regions.sort((a, b) => a.start - b.start);
  for (let i = 1; i < regions.length; i++) check(regions[i].start >= regions[i - 1].end);
  const durationSeconds = Math.max(movieDuration / movieScale, ...results.map(track => track.durationSeconds));
  checkDuration(durationSeconds);
  return {mimeType: 'video/mp4', durationMs: Math.ceil(durationSeconds * 1000), sizeBytes: bytes.length, width: videos[0].width, height: videos[0].height, bytes};
}
