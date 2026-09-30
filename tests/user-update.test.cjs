require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('class-validator');
const {RoleDto}=require('../apps/api/dist/dto.js');
test('account changes validate status, role and password independently',async()=>{
  for(const change of [{active:false},{active:true},{role:'REVIEWER'},{password:'NewPassword123!'}]){
    assert.equal((await validate(Object.assign(new RoleDto(),change))).length,0);
  }
  for(const change of [{active:'false'},{role:'SUPERADMIN'},{password:'short'},{password:123456789012}]){
    assert.ok((await validate(Object.assign(new RoleDto(),change))).length>0);
  }
});
