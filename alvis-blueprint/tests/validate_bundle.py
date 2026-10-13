import json
from pathlib import Path
from collections import Counter
# This validates this bundle's restricted JSON Schema vocabulary, not arbitrary schemas.
# Use Ajv or jsonschema as the production application validator.
class Draft202012Validator:
 @staticmethod
 def check_schema(schema):
  assert isinstance(schema,dict) and schema.get('type')=='object'
 def __init__(self,schema): self.schema=schema
 def iter_errors(self,value):
  def walk(schema,v,path='$'):
   types=schema.get('type'); types=[types] if isinstance(types,str) else types
   mapping={'object':dict,'array':list,'string':str,'integer':int,'boolean':bool,'null':type(None)}
   if types and not any(type(v) is mapping[k] for k in types):
    yield path+': wrong type'; return
   if 'enum' in schema and v not in schema['enum']: yield path+': invalid enum'
   if isinstance(v,dict):
    for k in schema.get('required',[]):
     if k not in v: yield path+': missing '+k
    if schema.get('additionalProperties') is False:
     for k in v:
      if k not in schema['properties']: yield path+': unknown '+k
    for k,sub in schema.get('properties',{}).items():
     if k in v: yield from walk(sub,v[k],path+'.'+k)
   if isinstance(v,list) and 'items' in schema:
    for i,x in enumerate(v): yield from walk(schema['items'],x,path+'['+str(i)+']')
  return walk(self.schema,value)
 def validate(self,value):
  errors=list(self.iter_errors(value)); assert not errors,errors
root=Path(__file__).resolve().parents[1]
load=lambda p:json.loads((root/p).read_text())
fixture=load('data/manufacturing-fixtures.json')
for path in (root/'schemas').glob('*.json'):
 Draft202012Validator.check_schema(json.loads(path.read_text()))
validator=Draft202012Validator(load('schemas/knowledge-unit.schema.json'))
source_ids={s['id'] for s in fixture['sources']}
assert len(source_ids)==len(fixture['sources'])==12
assert len(fixture['knowledge_units'])==12
assert Counter(r['status'] for r in fixture['knowledge_units'])=={'approved':7,'pending':2,'draft':1,'rejected':1,'retired':1}
for unit in fixture['knowledge_units']:
 validator.validate(unit['content'])
 assert unit['synthetic']
 assert unit['organization_id']==fixture['organization']['id']
 if unit['status']=='approved':
  assert unit['reviewed_by'] and unit['reviewed_at'] and unit['index_ready']
 for field in ['situation','signal','interpretation','decision','reason','outcome']:
  assert set(unit['content'][field]['evidence_ids'])<=source_ids
 for field in ['exceptions','prerequisites','stop_conditions','steps']:
  for claim in unit['content'][field]: assert set(claim['evidence_ids'])<=source_ids
unitmap={u['code']:u for u in fixture['knowledge_units']}
for case in load('data/evaluation-cases.json'):
 for code in case['relevant_units']:
  assert unitmap[code]['status']=='approved'
  assert unitmap[code]['content']['asset_code']==case['asset_code']
 for code in case['forbidden_units']: assert unitmap[code]['status']!='approved'
# Every object requires its declared fields and forbids unknown keys.
def check_strict(node):
 if isinstance(node,dict):
  if node.get('type')=='object':
   assert node.get('additionalProperties') is False
   assert set(node['required'])==set(node['properties'])
  for v in node.values(): check_strict(v)
 elif isinstance(node,list):
  for v in node:check_strict(v)
for path in (root/'schemas').glob('*.json'): check_strict(json.loads(path.read_text()))
# Invalid examples must be rejected by local validator.
bad=dict(fixture['knowledge_units'][0]['content']); bad['approved']=True
assert list(validator.iter_errors(bad))
bad=dict(fixture['knowledge_units'][0]['content']); del bad['reason']
assert list(validator.iter_errors(bad))
Draft202012Validator(load('schemas/lesson.schema.json')).validate(load('data/demo-lesson.json')['content'])
Draft202012Validator(load('schemas/answer.schema.json')).validate(load('data/demo-answer.json'))
validator.validate(load('data/draft-before-debrief.json'))
print('PASS: 4 schemas, 12 synthetic units, source references, status counts, 15 evaluation contracts and invalid payload rejection')
print('Not tested: live OpenAI calls, SQL execution, RLS sessions, media pipeline or browser app')
