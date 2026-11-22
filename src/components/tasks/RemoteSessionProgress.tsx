import { c as _c } from "react/compiler-runtime";
import React from 'react';
import { Text } from '../../ink.js';
import { count } from '../../utils/array.js';
export function RemoteSessionProgress(t0) {
  const $ = _c(11);
  const {
    session
  } = t0;
  if (session.status === "completed") {
    let t1;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
      t1 = <Text bold={true} color="success" dimColor={true}>done</Text>;
      $[2] = t1;
    } else {
      t1 = $[2];
    }
    return t1;
  }
  if (session.status === "failed") {
    let t1;
    if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
      t1 = <Text bold={true} color="error" dimColor={true}>error</Text>;
      $[3] = t1;
    } else {
      t1 = $[3];
    }
    return t1;
  }
  if (!session.todoList.length) {
    let t1;
    if ($[4] !== session.status) {
      t1 = <Text dimColor={true}>{session.status}…</Text>;
      $[4] = session.status;
      $[5] = t1;
    } else {
      t1 = $[5];
    }
    return t1;
  }
  let t1;
  if ($[6] !== session.todoList) {
    t1 = count(session.todoList, _temp);
    $[6] = session.todoList;
    $[7] = t1;
  } else {
    t1 = $[7];
  }
  const completed = t1;
  const total = session.todoList.length;
  let t2;
  if ($[8] !== completed || $[9] !== total) {
    t2 = <Text dimColor={true}>{completed}/{total}</Text>;
    $[8] = completed;
    $[9] = total;
    $[10] = t2;
  } else {
    t2 = $[10];
  }
  return t2;
}
function _temp(_) {
  return _.status === "completed";
}
