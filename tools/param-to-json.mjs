#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';

function printUsage() {
    console.log(`Usage:
  node tools/param-to-json.mjs <file> [--out output.json] [--wrap key]
  node tools/param-to-json.mjs --stdin [--out output.json] [--wrap key]
  node tools/param-to-json.mjs --tui

Behavior:
  - Reads any Unity-style asset/text file that contains a \`Params:\` block
  - Converts every object listed under \`Params:\` into JSON
  - Writes a sibling .json file by default when a file path is provided
  - Prints JSON to stdout when using --stdin unless --out is specified
  - \`--tui\` launches an interactive terminal UI for file selection and output options

Examples:
  node tools/param-to-json.mjs "C:\\path\\Manager.asset"
  node tools/param-to-json.mjs "C:\\path\\MineRegion.asset" --out "C:\\path\\MineRegion.json"
  Get-Content .\\Manager.asset | node tools/param-to-json.mjs --stdin
  node tools/param-to-json.mjs --tui`);
}

function parseArgs(argv) {
    const options = {
        input: null,
        stdin: false,
        out: null,
        wrap: null,
        tui: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--stdin') {
            options.stdin = true;
            continue;
        }

        if (arg === '--out') {
            options.out = argv[i + 1] || null;
            i += 1;
            continue;
        }

        if (arg === '--wrap') {
            options.wrap = argv[i + 1] || null;
            i += 1;
            continue;
        }

        if (arg === '--tui') {
            options.tui = true;
            continue;
        }

        if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        }

        if (!options.input) {
            options.input = arg;
        }
    }

    return options;
}

function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => {
            data += chunk;
        });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
}

function parseScalar(value) {
    const trimmed = value.trim();

    if (trimmed === '') {
        return '';
    }

    if (trimmed === 'true') {
        return true;
    }

    if (trimmed === 'false') {
        return false;
    }

    if (trimmed === 'null') {
        return null;
    }

    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
        return Number(trimmed);
    }

    return trimmed;
}

function getIndent(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
}

function extractParamsBlock(lines) {
    const startIndex = lines.findIndex(line => line.trim() === 'Params:');
    if (startIndex === -1) {
        return [];
    }

    const paramsIndent = getIndent(lines[startIndex]);
    const block = [];

    for (let i = startIndex + 1; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === '') {
            continue;
        }

        const indent = getIndent(line);
        const isTopLevelListItem = indent === paramsIndent && trimmed.startsWith('- ');
        if (indent <= paramsIndent && !isTopLevelListItem) {
            break;
        }

        block.push(line);
    }

    return block;
}

function extractParamObjects(inputText) {
    const lines = inputText.replace(/\r/g, '').split('\n');
    const paramLines = extractParamsBlock(lines);

    if (paramLines.length === 0) {
        return [];
    }

    const objects = [];
    let currentObject = null;

    for (const line of paramLines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('- ')) {
            if (currentObject) {
                objects.push(currentObject);
            }

            currentObject = {};
            const firstField = trimmed.slice(2).trim();
            if (firstField.includes(':')) {
                const separatorIndex = firstField.indexOf(':');
                const key = firstField.slice(0, separatorIndex).trim();
                const value = firstField.slice(separatorIndex + 1).trim();
                currentObject[key] = parseScalar(value);
            }
            continue;
        }

        if (!currentObject) {
            continue;
        }

        if (trimmed.includes(':')) {
            const separatorIndex = trimmed.indexOf(':');
            const key = trimmed.slice(0, separatorIndex).trim();
            const value = trimmed.slice(separatorIndex + 1).trim();
            currentObject[key] = parseScalar(value);
        }
    }

    if (currentObject) {
        objects.push(currentObject);
    }

    return objects;
}

function buildOutput(entries, wrapKey) {
    return wrapKey ? { [wrapKey]: entries } : entries;
}

function resolveOutputPath(inputPath, explicitOut) {
    if (explicitOut) {
        return path.resolve(explicitOut);
    }

    if (!inputPath) {
        return null;
    }

    const absoluteInput = path.resolve(inputPath);
    const parsedPath = path.parse(absoluteInput);
    return path.join(parsedPath.dir, `${parsedPath.name}.json`);
}

async function convertInput({ inputText, inputPath = null, out = null, wrap = null, silent = false }) {
    const entries = extractParamObjects(inputText);
    if (entries.length === 0) {
        throw new Error('No Params entries were found in the input.');
    }

    const outputObject = buildOutput(entries, wrap);
    const outputJson = `${JSON.stringify(outputObject, null, 2)}\n`;
    const outputPath = resolveOutputPath(inputPath, out);

    if (outputPath) {
        try {
            fs.writeFileSync(outputPath, outputJson, 'utf8');
            if (!silent) {
                console.log(`Wrote ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} to ${outputPath}`);
            }
            return { entries, outputJson, outputPath, wroteFile: true };
        } catch (error) {
            if (!silent) {
                console.warn(`Could not write to ${outputPath}: ${error.message}`);
                console.warn('Printing JSON to stdout instead. Use --out to choose a writable destination if needed.');
            }
        }
    }

    if (!silent) {
        process.stdout.write(outputJson);
    }

    return { entries, outputJson, outputPath: null, wroteFile: false };
}

function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function askQuestion(rl, question) {
    return new Promise(resolve => {
        rl.question(question, answer => resolve(answer.trim()));
    });
}

async function runTui() {
    const rl = createInterface();

    try {
        console.log('Param to JSON TUI');
        console.log('-----------------');

        const inputPath = await askQuestion(rl, 'Asset/text file path: ');
        if (!inputPath) {
            throw new Error('A file path is required.');
        }

        const inputText = fs.readFileSync(path.resolve(inputPath), 'utf8');
        const detectedEntries = extractParamObjects(inputText);
        if (detectedEntries.length === 0) {
            throw new Error('No Params entries were found in the input.');
        }

        console.log(`Detected ${detectedEntries.length} Params entr${detectedEntries.length === 1 ? 'y' : 'ies'}.`);

        const wrapAnswer = await askQuestion(rl, 'Wrap under a root key? Leave blank for none: ');
        const outputMode = await askQuestion(rl, 'Output mode: [1] write .json next to input, [2] custom path, [3] print only: ');

        let out = null;
        let silent = false;

        if (outputMode === '2') {
            out = await askQuestion(rl, 'Custom output path: ');
            if (!out) {
                throw new Error('A custom output path is required for mode 2.');
            }
        } else if (outputMode === '3') {
            silent = false;
            out = null;
        }

        const result = await convertInput({
            inputText,
            inputPath: outputMode === '3' ? null : inputPath,
            out,
            wrap: wrapAnswer || null,
            silent
        });

        if (!result.wroteFile) {
            console.log('\nConversion complete.');
        }
    } finally {
        rl.close();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.tui) {
        await runTui();
        return;
    }

    if (!options.stdin && !options.input) {
        printUsage();
        process.exit(1);
    }

    const inputText = options.stdin
        ? await readStdin()
        : fs.readFileSync(path.resolve(options.input), 'utf8');

    await convertInput({
        inputText,
        inputPath: options.stdin ? null : options.input,
        out: options.out,
        wrap: options.wrap
    });
}

await main();
