(function () {
 var script = document.currentScript;
 var root = script && script.previousElementSibling;
 if (!root || root.className.indexOf('ielts-anki-card') < 0) {
  var roots = document.querySelectorAll('.ielts-anki-card');
  root = roots.length ? roots[roots.length - 1] : null;
 }
 if (!root || root.className.indexOf('ielts-anki-card') < 0) return;
 var rows = root.querySelectorAll('.choice');
 var result = root.querySelector('.result');
 var check = root.querySelector('[data-check]');
 var reset = root.querySelector('[data-reset]');
 if (!check || !reset || !result) return;
 var i;
 for (i = 0; i < rows.length; i++) {
  rows[i].querySelector('input').onchange = function () {
   this.parentNode.className = 'choice' + (this.checked ? ' selected' : '');
   result.className = 'result'; result.textContent = '';
  };
 }
 check.onclick = function () {
  var count = 0, missed = 0, wrong = 0;
  for (i = 0; i < rows.length; i++) if (rows[i].querySelector('input').checked) count++;
  if (!count) { result.className = 'result error'; result.textContent = '请先选择你认为符合书中对应的表达。'; return; }
  for (i = 0; i < rows.length; i++) {
   var row = rows[i], input = row.querySelector('input');
   var correct = row.getAttribute('data-correct') === 'yes', label = '';
   input.disabled = true;
   if (correct && input.checked) { row.className = 'choice good'; label = '✓ 选对'; }
   else if (correct) { row.className = 'choice missed'; label = '! 漏选'; missed++; }
   else if (input.checked) { row.className = 'choice bad'; label = '✕ 错选'; wrong++; }
   else { row.className = 'choice neutral'; }
   row.querySelector('.choice-state').textContent = label;
  }
  result.className = 'result ' + (missed || wrong ? 'error' : 'success');
  result.textContent = missed || wrong ? '漏选 ' + missed + ' 项 · 错选 ' + wrong + ' 项。请对照背面完整对应。' : '全部选对，完整认出了书中列出的这组对应。';
  check.disabled = true; reset.hidden = false;
 };
 reset.onclick = function () {
  for (i = 0; i < rows.length; i++) {
   rows[i].className = 'choice';
   var input = rows[i].querySelector('input'); input.checked = false; input.disabled = false;
   rows[i].querySelector('.choice-state').textContent = '';
  }
  result.className = 'result'; result.textContent = ''; check.disabled = false; reset.hidden = true;
 };
})();
