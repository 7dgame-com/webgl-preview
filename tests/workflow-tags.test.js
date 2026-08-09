const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/webgl-preview-ci.yml'),
  'utf8'
);

test('registry publishing is limited to develop, main, publish, and latest', () => {
  assert.match(workflow, /push:\n    branches: \[develop, main, publish\]/);
  assert.doesNotMatch(workflow, /tags: \["\*"\]/);
  assert.doesNotMatch(workflow, /type=(?:sha|semver)/);
  assert.doesNotMatch(workflow, /type=ref,event=tag/);
  assert.doesNotMatch(workflow, /image_tag|webgl-preview,enable/);
  assert.match(workflow, /type=ref,event=branch/);
  assert.match(
    workflow,
    /type=raw,value=latest,enable=\$\{\{ github\.ref == 'refs\/heads\/publish'/
  );
  assert.match(
    workflow,
    /github\.event_name == 'push'.*refs\/heads\/develop.*refs\/heads\/main.*refs\/heads\/publish/
  );
});
