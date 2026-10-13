'use strict';

import { readFileSync } from 'node:fs';

export default function readJson(url) {
    return JSON.parse(readFileSync(url, 'utf8'));
}
