import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bodyRotation,surface,toWorld} from '../web/scene.js';
test('SPICE to renderer map preserves distance and handedness',()=>{const v=toWorld([3,4,12]);assert.ok(Math.abs(v.length()*1737.4-13)<1e-12);assert.ok(toWorld([1,0,0]).cross(toWorld([0,1,0])).normalize().distanceTo(toWorld([0,0,1]).normalize())<1e-12);});
test('Prime meridian and east-positive texture/marker coordinates agree',()=>{assert.ok(surface(0,0).distanceTo(new THREE.Vector3(1,0,0))<1e-12);assert.ok(surface(0,90).distanceTo(new THREE.Vector3(0,0,-1))<1e-12);assert.ok(surface(90,0).distanceTo(new THREE.Vector3(0,1,0))<1e-12);});
test('Body matrices are conjugated into the rendering basis, not transposed',()=>{const rows=[[0,-1,0],[1,0,0],[0,0,1]],m=bodyRotation(rows);assert.ok(toWorld([1,0,0]).applyMatrix4(m).distanceTo(toWorld([0,1,0]))<1e-12);});
