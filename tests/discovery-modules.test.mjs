import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MODULES,getModule,validateAnswers,scoreAnswers} from '../api/_discovery-modules.mjs';

const fill = (module,value) => Object.fromEntries(module.questions.map(question => [question.id,value]));
const keyed = (module,value) => Object.fromEntries(module.questions.map(question => [question.id,question.reverse ? 6-value : value]));
const expectedOriginals = ['affection-preferences','closeness-reflection'];
const existingSource = fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const originalQuestions = existingSource.match(/const QUESTIONS=\[([\s\S]*?)\];/)[1];

for (const id of expectedOriginals) {
  const module = getModule(id);
  assert.ok(module,`${id} exists`);
  assert.equal(module.questions.length,10);
  assert.match(module.provenance,/Original Duh Wild/);
  assert.equal(module.version,'1');
  for (const question of module.questions) assert.ok(!originalQuestions.includes(question.text),'new content does not duplicate a Vibe prompt');
}
assert.equal(getModule('affection-preferences').title,'Feel Loved');
assert.equal(getModule('__proto__'),null);
assert.equal(getModule('constructor'),null);
assert.equal(getModule('unknown'),null);
for (const id of [null,undefined,1,[],{}]) assert.equal(getModule(id),null);
for (const version of ['0','2','',1,null,{}]) assert.equal(getModule('affection-preferences',version),null);
assert.equal(new Set(MODULES.map(module => `${module.id}@${module.version}`)).size,MODULES.length);

for (const module of MODULES) {
  assert.equal(getModule(module.id,module.version),module);
  assert.ok(Object.isFrozen(module));
  assert.ok(Object.isFrozen(module.questions[0]));
  assert.ok(Object.isFrozen(module.dimensions));
  assert.equal(new Set(module.questions.map(question => question.id)).size,module.questions.length);
  assert.equal(new Set(module.dimensions.map(dimension => dimension.id)).size,module.dimensions.length);
  assert.deepEqual(module.scale.map(option => option.value),[1,2,3,4,5]);
  for (const question of module.questions) {
    assert.ok(module.dimensions.some(dimension => dimension.id === question.dimension));
    assert.ok(typeof question.text === 'string' && question.text.length > 0);
    assert.ok(question.reverse === undefined || typeof question.reverse === 'boolean');
  }
  for (const dimension of module.dimensions) assert.ok(module.questions.some(question => question.dimension === dimension.id));

  assert.equal(validateAnswers(module,{}),true);
  assert.equal(validateAnswers(module,{}, {complete:true}),false);
  assert.deepEqual(scoreAnswers(module,{}).dimensions,[]);
  assert.match(scoreAnswers(module,{}).summary,/No responses yet/);
  assert.match(scoreAnswers(module,{}).caution,/not a diagnosis/);
  const firstQuestion = module.questions[0];
  const partial = {[firstQuestion.id]:4};
  assert.equal(validateAnswers(module,partial),true);
  assert.equal(validateAnswers(module,partial,{complete:true}),false);
  assert.equal(scoreAnswers(module,partial).dimensions.length,1);
  assert.equal(scoreAnswers(module,partial).dimensions[0].maxScore,5);
  assert.equal(scoreAnswers(module,partial).dimensions[0].score,firstQuestion.reverse ? 2 : 4);
  assert.match(scoreAnswers(module,partial).summary,/Partial reflection: 1 of/);

  for (const value of [1,2,3,4,5]) {
    const answers = keyed(module,value);
    assert.equal(validateAnswers(module,answers,{complete:true}),true);
    const result = scoreAnswers(module,answers);
    assert.equal(result.dimensions.length,module.dimensions.length);
    assert.match(result.summary,new RegExp(`all ${module.questions.length} statements`));
    assert.deepEqual(result.dimensions.map(dimension => dimension.id),module.dimensions.map(dimension => dimension.id),'ties remain in declared order');
    for (const dimension of result.dimensions) {
      const count = module.questions.filter(question => question.dimension === dimension.id).length;
      assert.equal(dimension.score,count*value,'keyed score covers every boundary, including reverse items');
      assert.equal(dimension.maxScore,count*5);
      assert.ok(dimension.score >= count && dimension.score <= dimension.maxScore);
      assert.match(dimension.description,new RegExp(`${value}\\.0 of 5`));
    }
    const shuffled = Object.fromEntries(Object.entries(answers).reverse());
    assert.deepEqual(scoreAnswers(module,shuffled),result,'input key order does not break ties');
    assert.deepEqual(scoreAnswers(module,answers),result,'scoring is deterministic');
  }
  for (const question of module.questions) {
    for (const value of [1,2,3,4,5]) {
      const result = scoreAnswers(module,{[question.id]:value});
      assert.equal(result.dimensions[0].score,question.reverse ? 6-value : value);
    }
  }
  for (const value of [0,6,-1,1.5,NaN,Infinity,-Infinity,'1',true,false,null,undefined,{},[],1n]) {
    const answers = {...fill(module,3),[firstQuestion.id]:value};
    assert.equal(validateAnswers(module,answers),false,`reject ${String(value)}`);
    assert.throws(() => scoreAnswers(module,answers),TypeError);
  }
  for (const answers of [null,undefined,[],[1],1,0,true,'{}',new Date(),new Map(),new Set(),new Number(3),()=>{}]) {
    assert.equal(validateAnswers(module,answers),false,'reject non-record answers');
    assert.throws(() => scoreAnswers(module,answers),TypeError);
  }
  const nullPrototype = Object.assign(Object.create(null),fill(module,3));
  assert.equal(validateAnswers(module,nullPrototype,{complete:true}),true);
  assert.deepEqual(scoreAnswers(module,nullPrototype),scoreAnswers(module,fill(module,3)));
  for (const key of ['unknown','__proto__','constructor','prototype','toString','hasOwnProperty']) {
    const answers = {...fill(module,3)};
    Object.defineProperty(answers,key,{value:3,enumerable:true});
    assert.equal(validateAnswers(module,answers),false,`reject own ${key}`);
  }
  assert.equal(validateAnswers(module,JSON.parse('{"__proto__":{"polluted":true}}')),false);
  assert.equal({}.polluted,undefined);
  assert.equal(validateAnswers(module,Object.create(fill(module,3))),false,'inherited values cannot complete a record');
  assert.equal(validateAnswers(module,Object.assign(Object.create({unknown:3}),fill(module,3))),false,'custom prototypes are rejected');
  assert.equal(validateAnswers(module,{...fill(module,3),[Symbol('unknown')]:3}),false,'symbol keys are rejected');
  const hidden = fill(module,3);
  Object.defineProperty(hidden,'unknown',{value:3,enumerable:false});
  assert.equal(validateAnswers(module,hidden),false,'hidden unknown properties are rejected');
  const hiddenAnswer = fill(module,3);
  Object.defineProperty(hiddenAnswer,firstQuestion.id,{value:3,enumerable:false});
  assert.equal(validateAnswers(module,hiddenAnswer),false,'answers must be JSON enumerable');
  let getterCalls = 0;
  const accessor = {...fill(module,3)};
  Object.defineProperty(accessor,firstQuestion.id,{get(){getterCalls++;return 3},enumerable:true});
  assert.equal(validateAnswers(module,accessor),false,'accessors are rejected');
  assert.equal(getterCalls,0,'validation never invokes an answer getter');
  const revoked = Proxy.revocable({},{});revoked.revoke();
  assert.equal(validateAnswers(module,revoked.proxy),false,'uninspectable records fail closed');
  assert.equal(validateAnswers(module,fill(module,3),{complete:'yes'}),false);
  const before = JSON.stringify(fill(module,3)),answers = JSON.parse(before);
  scoreAnswers(module,answers);
  assert.equal(JSON.stringify(answers),before,'scoring does not change input');
}
for (const module of [null,undefined,{},[],{questions:[]},{...MODULES[0]}]) {
  assert.equal(validateAnswers(module,{}),false,'only registered, immutable modules can score');
  assert.throws(() => scoreAnswers(module,{}),TypeError);
}
assert.ok(MODULES.some(module => module.questions.some(question => question.reverse)),'reverse-keyed coverage is exercised');
const mini = getModule('mini-ipip-20','1');
assert.ok(mini);
assert.equal(mini.questions.length,20);
assert.match(mini.provenance,/Public-domain/);
assert.deepEqual(mini.questions.filter(question => question.reverse).map(question => Number(question.id.slice(-2))),[6,7,8,9,10,15,16,17,18,19,20],'Mini-IPIP reverse key matches the published appendix, including three Intellect/Imagination items');
const publishedKey = {
  extraversion:[1,6,11,16],
  agreeableness:[2,7,12,17],
  conscientiousness:[3,8,13,18],
  neuroticism:[4,9,14,19],
  'intellect-imagination':[5,10,15,20]
};
for (const [dimension,numbers] of Object.entries(publishedKey)) {
  assert.deepEqual(mini.questions.filter(question => question.dimension === dimension).map(question => Number(question.id.slice(-2))),numbers);
}
assert.deepEqual(scoreAnswers(mini,fill(mini,5)).dimensions.map(dimension => dimension.score),[12,12,12,12,8],'all-accurate responses preserve original scale direction');
assert.deepEqual(scoreAnswers(mini,fill(mini,1)).dimensions.map(dimension => dimension.score),[12,12,12,12,16]);
assert.deepEqual(mini.scale.map(option => option.label),['Very inaccurate','Moderately inaccurate','Neither inaccurate nor accurate','Moderately accurate','Very accurate']);
assert.ok(mini.sources.some(source => source.url === 'https://www.ipip.ori.org/MiniIPIPKey.htm'));
assert.match(mini.dimensions.find(dimension => dimension.id === 'neuroticism').description,/does not indicate a mental health condition/);
console.log('Discovery modules: content, scoring, partial drafts, boundaries, and prototype safety passed.');
