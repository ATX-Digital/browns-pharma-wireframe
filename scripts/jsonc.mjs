export function parseJsonc(source, filename = 'JSONC file') {
  let output = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        output += character;
      } else {
        output += ' ';
      }
      continue;
    }

    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        output += '  ';
        index += 1;
      } else {
        output += character === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === '/' && next === '/') {
      lineComment = true;
      output += '  ';
      index += 1;
    } else if (character === '/' && next === '*') {
      blockComment = true;
      output += '  ';
      index += 1;
    } else {
      output += character;
    }
  }

  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${filename} is not valid JSON/JSONC: ${error.message}`);
  }
}
