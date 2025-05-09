// 初始化IndexedDB
let db;
const DB_NAME = 'law-assistant-db';
const DB_VERSION = 1;
const HISTORY_STORE = 'history';
const SETTINGS_STORE = 'settings';

// 默认设置
const DEFAULT_SETTINGS = {
  apiKey: 'sk-FadRRn1rmnl5cBivgMuR7pvppW8bTxo83QAUJ0osdAEnxEXe',
  apiUrl: 'https://new1.588686.xyz/v1/chat/completions',
  model: 'deepseek-chat',
  temperature: 0.7,
  systemPrompt:
    '你是一个专业的法律AI助手，拥有丰富的法律知识，特别擅长处理农民工劳动纠纷案件。请基于相关法律法规和司法案例，提供准确、公正的法律意见，并以清晰的时间线形式提供具体指导。你的回答应包含：1.依据法条 2.案情基本分析（依据指导性案例、典型案例和主客观要件） 3.适合农民工的具体措施（证据提交指导、诉讼流程、诉讼时效、保全措施、仲裁方式） 4.以时间线形式列出农民工应该采取的步骤，包括固定证据、申诉等。',
  customModels: [],
};

// 添加全局渲染函数
function renderMarkdownToElement(markdown, elementId) {
  // console.log(
  //   `尝试渲染到元素: #${elementId}, 内容长度: ${markdown?.length || 0}`
  // );

  // 始终重新获取元素
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`元素不存在: #${elementId}`);
    return false;
  }

  try {
    // 处理空内容
    if (!markdown || markdown.trim() === '') {
      element.innerHTML = '<p>没有内容可显示</p>';
      return true;
    }

    // 文本预处理：确保markdown中的# 后有空格，这是常见错误
    let processedMarkdown = markdown;
    processedMarkdown = processedMarkdown.replace(
      /^(#{1,6})([^#\s])/gm,
      '$1 $2'
    );

    // 尝试使用marked渲染
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      try {
        // console.log('使用marked渲染内容...');
        // 解决方案：使用marked.parse而不是marked，确保调用正确的方法
        let html = '';
        try {
          html = marked.parse(processedMarkdown);
        } catch (e) {
          console.warn('marked.parse失败，尝试直接调用marked', e);
          html = marked(processedMarkdown);
        }

        // console.log(`渲染成功，结果长度: ${html.length}`);

        // 使用innerHTML而不是直接赋值，并检查结果
        element.innerHTML = html;
        // console.log('已设置元素内容为渲染后的HTML');

        return true;
      } catch (parseError) {
        console.error('marked解析错误:', parseError);
        // 解析失败使用纯文本
        element.innerText = markdown;
        return false;
      }
    } else {
      // marked不可用时使用纯文本
      console.warn('marked库不可用，使用纯文本, marked类型:', typeof marked);
      element.innerText = markdown;
      return false;
    }
  } catch (e) {
    console.error('renderMarkdownToElement错误:', e);
    try {
      element.innerText = markdown;
    } catch (innerError) {
      console.error('设置纯文本也失败:', innerError);
    }
    return false;
  }
}

// 添加确保marked库加载的函数
function ensureMarkedLoaded() {
  return new Promise((resolve, reject) => {
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      console.log('Marked库已加载');
      resolve(true);
      return;
    }

    console.log('尝试加载Marked库...');

    // 尝试加载CDN版本
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    script.onload = () => {
      console.log('CDN Marked库加载成功');
      resolve(true);
    };
    script.onerror = () => {
      console.error('CDN Marked库加载失败，尝试加载本地版本');

      // 尝试加载本地版本
      const localScript = document.createElement('script');
      localScript.src = 'marked.min.js';
      localScript.onload = () => {
        console.log('本地Marked库加载成功');
        resolve(true);
      };
      localScript.onerror = err => {
        console.error('所有Marked库加载失败', err);
        reject(new Error('无法加载Marked库'));
      };
      document.body.appendChild(localScript);
    };

    document.body.appendChild(script);
  });
}

// 新增：生成状态管理
let isGenerating = false;
let currentGeneratingData = null;
let currentAbortController = null;
let accumulatedMarkdown = ''; // 将这个变量提升到全局，以便在不同函数间共享
let renderTimer = null; // 用于定期尝试渲染

// 启动定期渲染
function startPeriodicRendering(elementId) {
  // 清除任何现有计时器
  stopPeriodicRendering();

  // 设置新计时器
  renderTimer = setInterval(() => {
    if (accumulatedMarkdown && accumulatedMarkdown.length > 0) {
      console.log('定期渲染触发');
      renderMarkdownToElement(accumulatedMarkdown, elementId);
    }
  }, 1000); // 每1秒尝试渲染一次

  console.log('定期渲染已启动');
}

// 停止定期渲染
function stopPeriodicRendering() {
  if (renderTimer) {
    clearInterval(renderTimer);
    renderTimer = null;
    console.log('定期渲染已停止');
  }
}

// 法律表单处理逻辑
document.addEventListener('DOMContentLoaded', function () {
  // 确保marked库加载
  ensureMarkedLoaded()
    .then(() => console.log('Marked库已准备好'))
    .catch(err => console.error('Marked库初始化失败:', err));

  // 添加marked库加载检查
  let markedLoaded = false;
  try {
    markedLoaded =
      typeof marked !== 'undefined' && typeof marked.parse === 'function';
    if (!markedLoaded) {
      console.error('Marked库未正确加载，将使用纯文本显示');
    } else {
      console.log('Marked库加载成功');
    }
  } catch (e) {
    console.error('检查Marked库时出错:', e);
  }

  // DOM元素
  const legalForm = document.querySelector('.legal-form');
  const submitLegalFormBtn = document.getElementById('submitLegalForm');
  const resetFormBtn = document.getElementById('resetForm');
  const resultModal = document.getElementById('resultModal');
  const closeResultBtn = document.getElementById('closeResultBtn');
  const closeResultModalBtn = document.getElementById('closeResultModalBtn');
  const printResultBtn = document.getElementById('printResultBtn');
  const saveResultBtn = document.getElementById('saveResultBtn');
  const resultContent = document.getElementById('resultContent');

  // 新增：历史记录结果展示弹窗元素
  const historicalResultModal = document.getElementById(
    'historicalResultModal'
  );
  const historicalResultContent = document.getElementById(
    'historicalResultContent'
  );
  const closeHistoricalResultModalBtn = document.getElementById(
    'closeHistoricalResultModalBtn'
  );
  const printHistoricalResultBtn = document.getElementById(
    'printHistoricalResultBtn'
  );
  const closeHistoricalResultModalFooterBtn = document.getElementById(
    'closeHistoricalResultModalFooterBtn'
  );

  // 农民工信息输入
  const workerNameInput = document.getElementById('workerName');
  const workerIdCardInput = document.getElementById('workerIdCard');
  const workerAddressInput = document.getElementById('workerAddress');

  // 被告人信息输入
  const employerNameInput = document.getElementById('employerName');
  const employerRepNameInput = document.getElementById('employerRepName');
  const employerRepIdInput = document.getElementById('employerRepId');

  // 证据和诉求输入
  const otherEvidenceInput = document.getElementById('otherEvidence');

  // 金额输入及其复选框
  const hasSalaryAmountCheckbox = document.getElementById('hasSalaryAmount');
  const hasCompensationAmountCheckbox = document.getElementById(
    'hasCompensationAmount'
  );
  const salaryAmountInput = document.getElementById('salaryAmount');
  const compensationAmountInput = document.getElementById('compensationAmount');

  const otherDemandsInput = document.getElementById('otherDemands');

  // 添加复选框事件监听
  if (hasSalaryAmountCheckbox) {
    hasSalaryAmountCheckbox.addEventListener('change', function () {
      salaryAmountInput.disabled = !this.checked;
      if (!this.checked) {
        salaryAmountInput.value = '';
      }
    });
  }

  if (hasCompensationAmountCheckbox) {
    hasCompensationAmountCheckbox.addEventListener('change', function () {
      compensationAmountInput.disabled = !this.checked;
      if (!this.checked) {
        compensationAmountInput.value = '';
      }
    });
  }

  // 案例按钮
  const exampleBtns = document.querySelectorAll('.example-btn');

  // 设置相关元素
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiUrlInput = document.getElementById('apiUrlInput');
  const modelSelect = document.getElementById('modelSelect');
  const temperatureInput = document.getElementById('temperatureInput');
  const temperatureValue = document.getElementById('temperatureValue');
  const systemPromptInput = document.getElementById('systemPromptInput');
  const customModelsContainer = document.getElementById(
    'customModelsContainer'
  );
  const newModelNameInput = document.getElementById('newModelNameInput');
  const addModelBtn = document.getElementById('addModelBtn');

  // 历史记录相关元素
  const historyBtn = document.getElementById('historyBtn');
  const historyModal = document.getElementById('historyModal');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // 新增：确认弹窗元素
  const confirmModal = document.getElementById('confirmModal');
  const confirmModalTitle = document.getElementById('confirmModalTitle');
  const confirmModalMessage = document.getElementById('confirmModalMessage');
  const closeConfirmModalBtn = document.getElementById('closeConfirmModalBtn');
  const confirmModalCancelBtn = document.getElementById(
    'confirmModalCancelBtn'
  );
  const confirmModalConfirmBtn = document.getElementById(
    'confirmModalConfirmBtn'
  );
  let currentOnConfirmCallback = null;

  // 新增：Toast通知容器
  const toastContainer = document.getElementById('toastContainer');

  // 初始化
  initDB()
    .then(() => {
      return Promise.all([getSettings(), loadHistoryList()]);
    })
    .then(([settings]) => {
      // 重新获取DOM元素引用，确保在异步操作中DOM引用有效
      const resultContentEl = document.getElementById('resultContent');
      const historicalResultContentEl = document.getElementById(
        'historicalResultContent'
      );

      if (!resultContentEl) {
        console.error('无法找到结果内容元素(resultContent)');
      }

      if (!historicalResultContentEl) {
        console.error('无法找到历史结果内容元素(historicalResultContent)');
      }

      // 加载设置到界面
      apiKeyInput.value = settings.apiKey || '';
      apiUrlInput.value = settings.apiUrl || DEFAULT_SETTINGS.apiUrl;
      modelSelect.value = settings.model || DEFAULT_SETTINGS.model;
      temperatureInput.value =
        settings.temperature || DEFAULT_SETTINGS.temperature;
      temperatureValue.textContent =
        settings.temperature || DEFAULT_SETTINGS.temperature;
      systemPromptInput.value =
        settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt;

      // 加载自定义模型
      renderCustomModels(settings.customModels || []);
      initCustomModelsSelect(settings.customModels || []);
    })
    .catch(error => {
      console.error('初始化失败:', error);
      showErrorMessage('初始化失败: ' + error.message);
    });

  // 提交法律咨询表单
  if (submitLegalFormBtn) {
    submitLegalFormBtn.addEventListener('click', function (event) {
      event.preventDefault();
      handleLegalFormSubmit();
    });
  }

  // 重置表单
  if (resetFormBtn) {
    resetFormBtn.addEventListener('click', resetForm);
  }

  // 关闭结果弹窗
  if (closeResultBtn) {
    closeResultBtn.addEventListener('click', closeResultModal);
  }

  if (closeResultModalBtn) {
    closeResultModalBtn.addEventListener('click', closeResultModal);
  }

  // 保存结果
  if (saveResultBtn) {
    saveResultBtn.addEventListener('click', function () {
      // console.log('saveResultBtn event listener triggered'); // 日志已移除
      saveResult();
    });
  }

  // 打印结果
  if (printResultBtn) {
    printResultBtn.addEventListener('click', printResult);
  }

  // 设置相关事件
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      settingsModal.classList.add('active');
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.classList.remove('active');
    });
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }

  if (addModelBtn) {
    addModelBtn.addEventListener('click', addCustomModel);
  }

  if (newModelNameInput) {
    newModelNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomModel();
      }
    });
  }

  // 更新温度值显示
  if (temperatureInput) {
    temperatureInput.addEventListener('input', () => {
      temperatureValue.textContent = temperatureInput.value;
    });
  }

  // 历史记录相关事件
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      loadHistoryList().then(() => {
        if (isGenerating) {
          // If AI is generating in resultModal (default z-index 1000, or 1001 if showing loaded history)
          // ensure historyModal is on top.
          historyModal.style.zIndex = '1002';
        } else {
          historyModal.style.zIndex = '1000'; // Default if no generation conflict
        }
        historyModal.classList.add('active');
      });
    });
  }

  if (closeHistoryBtn) {
    closeHistoryBtn.addEventListener('click', () => {
      historyModal.classList.remove('active');
      historyModal.style.zIndex = ''; // Reset z-index on close
    });
  }

  if (closeHistoryModalBtn) {
    closeHistoryModalBtn.addEventListener('click', () => {
      historyModal.classList.remove('active');
      historyModal.style.zIndex = ''; // Reset z-index on close
    });
  }

  // 新增：关闭确认弹窗事件
  if (closeConfirmModalBtn) {
    closeConfirmModalBtn.addEventListener('click', () => {
      confirmModal.style.zIndex = ''; // 重置z-index
      confirmModal.classList.remove('active');
    });
  }
  if (confirmModalCancelBtn) {
    confirmModalCancelBtn.addEventListener('click', () => {
      confirmModal.style.zIndex = ''; // 重置z-index
      confirmModal.classList.remove('active');
    });
  }
  if (confirmModalConfirmBtn) {
    confirmModalConfirmBtn.addEventListener('click', () => {
      if (typeof currentOnConfirmCallback === 'function') {
        currentOnConfirmCallback();
      }
      confirmModal.style.zIndex = ''; // 重置z-index
      confirmModal.classList.remove('active');
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }

  // 示例案例点击事件
  exampleBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      const caseType = this.getAttribute('data-case');
      loadExampleCase(caseType);
    });
  });

  // 处理法律咨询表单提交
  async function handleLegalFormSubmit() {
    try {
      // 确保marked库加载
      await ensureMarkedLoaded();

      // 收集表单数据 (修改金额字段处理)
      const consultationData = {
        workerName: workerNameInput.value.trim(),
        workerIdCard: workerIdCardInput.value.trim(),
        workerAddress: workerAddressInput.value.trim(),
        employerName: employerNameInput.value.trim(),
        employerRepName: employerRepNameInput.value.trim(),
        employerRepId: employerRepIdInput.value.trim(),
        selectedEvidence: Array.from(
          document.querySelectorAll(
            '.evidence-checkboxes input[type="checkbox"]:checked'
          )
        ).map(checkbox => checkbox.value),
        otherEvidence: otherEvidenceInput.value.trim(),
        hasSalaryAmount: hasSalaryAmountCheckbox.checked,
        salaryAmount: hasSalaryAmountCheckbox.checked
          ? salaryAmountInput.value.trim()
          : '',
        hasCompensationAmount: hasCompensationAmountCheckbox.checked,
        compensationAmount: hasCompensationAmountCheckbox.checked
          ? compensationAmountInput.value.trim()
          : '',
        otherDemands: otherDemandsInput.value.trim(),
      };

      // 验证必填字段 (保持不变)
      if (!consultationData.workerName) {
        showErrorMessage('请填写农民工姓名');
        return;
      }
      if (!consultationData.employerName) {
        showErrorMessage('请填写被告单位名称');
        return;
      }

      if (isGenerating) {
        if (deepEqual(consultationData, currentGeneratingData)) {
          showToast('正在处理相同的请求，请稍候。', 'info');
          resultModal.classList.add('active'); // Ensure modal stays visible if user closed it

          // 确保按钮状态正确
          submitLegalFormBtn.disabled = false;
          saveResultBtn.disabled = false;
          printResultBtn.disabled = false;
          submitLegalFormBtn.style.opacity = '1';
          submitLegalFormBtn.style.cursor = 'pointer';

          return; // Same data, do nothing
        }
        // Different data, abort previous and proceed
        if (currentAbortController) {
          currentAbortController.abort();
          console.log('Previous AI generation aborted due to new request.');
        }
      }

      isGenerating = true;
      currentGeneratingData = consultationData;
      currentAbortController = new AbortController();

      // 禁用按钮
      submitLegalFormBtn.disabled = true;
      saveResultBtn.disabled = true;
      printResultBtn.disabled = true;
      submitLegalFormBtn.style.opacity = '0.7';
      submitLegalFormBtn.style.cursor = 'not-allowed';

      resultContent.innerHTML =
        '<div style="text-align:center;padding:40px 0;">AI正在生成法律建议，请稍候...</div>';
      resultModal.style.zIndex = '1000'; // Ensure default z-index if it was changed
      resultModal.classList.add('active');

      try {
        const settings = await getSettings();
        await fetchAIAdvice(
          consultationData,
          settings,
          currentAbortController.signal
        );
        // Success: fetchAIAdvice handles content, buttons re-enabled in finally
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('fetchAIAdvice fetch aborted.');
          // 不显示"操作已取消"的提示，让新请求接管UI
          // 如果是被新请求中止，不需要任何提示
        } else {
          console.error('Streaming fetch error in fetchAIAdvice:', error);
          resultContent.innerHTML = `<p style="color:red; text-align:center;">AI建议生成时发生网络或流处理错误: ${error.message}</p>`;
          showErrorMessage(`AI生成时出错: ${error.message}`);
        }
        throw error; // Re-throw for the caller's (handleLegalFormSubmit) finally block
      } finally {
        isGenerating = false;
        currentGeneratingData = null;
        // currentAbortController = null; // Cleared when a new one is made or on completion

        // 启用按钮
        submitLegalFormBtn.disabled = false;
        // Save/Print only enabled if content successfully generated (fetchAIAdvice could set a flag or check resultContent)
        // For now, enable them. A better approach would be to enable them only if resultContent has valid output.
        saveResultBtn.disabled = false;
        printResultBtn.disabled = false;
        submitLegalFormBtn.style.opacity = '1';
        submitLegalFormBtn.style.cursor = 'pointer';
      }
    } catch (error) {
      console.error('处理法律咨询表单时出错:', error);
      showErrorMessage('处理法律咨询表单时出错: ' + error.message);
    }
  }

  // AI接口调用函数 (流式处理)
  async function fetchAIAdvice(data, settings, signal) {
    // 重置全局累积markdown
    accumulatedMarkdown = '';

    // 启动定期渲染
    startPeriodicRendering('resultContent');

    // Added signal parameter
    // ... (拼接prompt - 根据复选框状态更新)
    let prompt = settings.systemPrompt + '\n';
    prompt += `农民工姓名：${data.workerName}\n`;
    prompt += `身份证号：${data.workerIdCard}\n`;
    prompt += `住址：${data.workerAddress}\n`;
    prompt += `被告单位名称：${data.employerName}\n`;
    prompt += `被告代表姓名：${data.employerRepName}\n`;
    prompt += `被告代表身份证号：${data.employerRepId}\n`;
    prompt += `证据：${(data.selectedEvidence || []).join('，')}`;
    if (data.otherEvidence) prompt += `，其他证据：${data.otherEvidence}`;
    prompt += `\n`;

    // 根据复选框状态添加金额字段
    if (data.hasSalaryAmount) {
      prompt += `工资金额：${data.salaryAmount}元\n`;
    }
    if (data.hasCompensationAmount) {
      prompt += `赔偿金额：${data.compensationAmount}元\n`;
    }

    prompt += `其他诉求：${data.otherDemands}\n`;
    prompt +=
      '请根据上述信息，生成详细的法律分析和建议。重要提示：你的回答必须是结构清晰的Markdown格式文本。内容结构需严格遵循系统提示词的要求（例如，使用#号作为各级标题，使用*或-作为列表项等）。';

    const body = {
      model: settings.model,
      messages: [
        { role: 'system', content: settings.systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: parseFloat(settings.temperature) || 0.7,
      stream: true,
    };
    const headers = {
      'Content-Type': 'application/json',
    };
    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    try {
      const resp = await fetch(settings.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal, // Pass the abort signal to fetch
      });

      if (!resp.ok) {
        const errorBody = await resp.text();
        // showErrorMessage in the calling function or here?
        // throw new Error(`AI接口请求失败: ${resp.status} ${resp.statusText}. Response: ${errorBody}`);
        // Let's display error directly and rethrow for the finally block in handleLegalFormSubmit
        const errorMessage = `AI接口请求失败: ${resp.status} ${resp.statusText}. ${errorBody}`;
        resultContent.innerHTML = `<p style="color:red; text-align:center;">${errorMessage}</p>`;
        showErrorMessage(errorMessage); // also show as toast
        throw new Error(errorMessage);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';
      let firstChunkReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream finished.');
          break;
        }

        if (!firstChunkReceived) {
          resultContent.innerHTML = ''; // Clear "AI正在生成..." message
          firstChunkReceived = true;
        }

        lineBuffer += decoder.decode(value, { stream: true });
        let eolIndex;
        while ((eolIndex = lineBuffer.indexOf('\n')) >= 0) {
          const line = lineBuffer.substring(0, eolIndex).trim();
          lineBuffer = lineBuffer.substring(eolIndex + 1);
          if (line.startsWith('data: ')) {
            const jsonData = line.substring(5).trim();
            if (jsonData.length === 0) continue;
            if (jsonData === '[DONE]') {
              console.log(
                'Received [DONE] signal from stream, breaking read loop.'
              );
              // reader.cancel(); // Might be needed if server doesn't close stream after [DONE]
              // For a well-behaved server, the `done` flag from reader.read() should become true after [DONE]
              // However, some servers might send [DONE] then keep the stream open until a timeout.
              // We will break here and rely on the outer `done` or a timeout on `fetch` if configured.
              // This explicit break for [DONE] is common for OpenAI-like streams.
              return; // Exit fetchAIAdvice as [DONE] means completion for OpenAI
            }
            try {
              const parsed = JSON.parse(jsonData);
              let textChunk = '';
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                textChunk = parsed.choices[0].delta.content;
              }
              if (textChunk) {
                accumulatedMarkdown += textChunk;

                // 重要：确保每个块都试图触发渲染
                setTimeout(() => {
                  renderMarkdownToElement(accumulatedMarkdown, 'resultContent');
                }, 0);

                // 立即尝试渲染一次
                renderMarkdownToElement(accumulatedMarkdown, 'resultContent');
              }
            } catch (e) {
              console.warn(
                'Skipping non-JSON line or parse error in stream:',
                jsonData,
                e
              );
            }
          }
        }
      }
      // Final parse for any remaining content in lineBuffer, if stream ends without [DONE]
      if (lineBuffer.trim().startsWith('data: ')) {
        const jsonData = lineBuffer.trim().substring(5).trim();
        if (jsonData.length > 0 && jsonData !== '[DONE]') {
          try {
            const parsed = JSON.parse(jsonData);
            let textChunk = '';
            if (parsed.choices && parsed.choices[0]?.delta?.content) {
              textChunk = parsed.choices[0].delta.content;
            }
            if (textChunk) {
              accumulatedMarkdown += textChunk;
              renderMarkdownToElement(accumulatedMarkdown, 'resultContent');
            }
          } catch (e) {
            console.warn(
              'Error parsing trailing streamed JSON line:',
              jsonData,
              e
            );
          }
        }
      }
      // Ensure even if stream ends and loop breaks, final content is parsed
      if (firstChunkReceived) {
        renderMarkdownToElement(accumulatedMarkdown, 'resultContent');
      }

      // 处理完成后停止定期渲染
      stopPeriodicRendering();
    } catch (error) {
      // 发生错误时停止定期渲染
      stopPeriodicRendering();

      if (error.name === 'AbortError') {
        console.log('fetchAIAdvice fetch aborted.');
        // 不显示"操作已取消"的提示，让新请求接管UI
        // 如果是被新请求中止，不需要任何提示
      } else {
        console.error('Streaming fetch error in fetchAIAdvice:', error);
        resultContent.innerHTML = `<p style="color:red; text-align:center;">AI建议生成时发生网络或流处理错误: ${error.message}</p>`;
        showErrorMessage(`AI生成时出错: ${error.message}`);
      }
      throw error; // Re-throw for the caller's (handleLegalFormSubmit) finally block
    }
  }

  // Helper function for deep comparison of consultationData
  function deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (
      typeof obj1 !== 'object' ||
      obj1 === null ||
      typeof obj2 !== 'object' ||
      obj2 === null
    ) {
      return false;
    }
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
      if (!obj2.hasOwnProperty(key)) return false; // Check if key exists in obj2
      const val1 = obj1[key];
      const val2 = obj2[key];
      if (Array.isArray(val1) && Array.isArray(val2)) {
        if (val1.length !== val2.length) return false;
        const sortedVal1 = [...val1].sort();
        const sortedVal2 = [...val2].sort();
        for (let i = 0; i < sortedVal1.length; i++) {
          if (sortedVal1[i] !== sortedVal2[i]) return false;
        }
      } else if (
        typeof val1 === 'object' &&
        val1 !== null &&
        typeof val2 === 'object' &&
        val2 !== null
      ) {
        // Recurse for nested objects if any
        if (!deepEqual(val1, val2)) return false;
      } else if (val1 !== val2) {
        return false;
      }
    }
    return true;
  }

  // 显示错误消息
  function showErrorMessage(message) {
    showToast(message, 'error');
  }

  // 新增：显示成功消息
  function showSuccessMessage(message) {
    showToast(message, 'success');
  }

  // 新增：显示Toast通知的函数
  function showToast(message, type = 'info', duration = 4000) {
    if (!toastContainer) return; // 如果容器不存在则不执行

    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // 动画结束后移除toast元素，但CSS动画已经处理了隐藏
    // 为了DOM整洁，在动画完全结束后（入场+停留+出场）移除
    const animationDuration = 500; // 对应 toastInRight/toastOut 的时长
    const stayDuration = duration - animationDuration * 2; // 减去入场和出场动画时间

    setTimeout(() => {
      // 触发CSS离场动画后，再等动画播完移除元素
      setTimeout(() => {
        if (toast.parentNode === toastContainer) {
          // 再次检查，防止toast已被其他方式移除
          toastContainer.removeChild(toast);
        }
      }, animationDuration);
    }, animationDuration + Math.max(0, stayDuration)); // Math.max确保停留时间不为负
  }

  // 初始化IndexedDB
  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;

        // 创建历史记录存储
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const historyStore = db.createObjectStore(HISTORY_STORE, {
            keyPath: 'id',
          });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 创建设置存储
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = function (event) {
        db = event.target.result;
        console.log('IndexedDB初始化成功');
        resolve(db);
      };

      request.onerror = function (event) {
        console.error('IndexedDB初始化失败:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // 获取设置
  function getSettings() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SETTINGS_STORE], 'readonly');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.get('app-settings');

      request.onsuccess = function (event) {
        if (event.target.result) {
          resolve(event.target.result);
        } else {
          resolve(DEFAULT_SETTINGS);
        }
      };

      request.onerror = function (event) {
        console.error('获取设置失败:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // 保存设置
  function saveSettings() {
    const settings = {
      id: 'app-settings',
      apiKey: apiKeyInput.value,
      apiUrl: apiUrlInput.value || DEFAULT_SETTINGS.apiUrl,
      model: modelSelect.value,
      temperature: temperatureInput.value,
      systemPrompt: systemPromptInput.value,
      customModels: Array.from(
        customModelsContainer.querySelectorAll('.model-name')
      ).map(el => el.textContent),
    };

    const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.put(settings);

    request.onsuccess = function () {
      console.log('设置保存成功');
      settingsModal.classList.remove('active');
    };

    request.onerror = function (event) {
      console.error('保存设置失败:', event.target.error);
      showErrorMessage('保存设置失败: ' + event.target.error);
    };
  }

  // 渲染自定义模型
  function renderCustomModels(models) {
    customModelsContainer.innerHTML = '';

    if (!models || models.length === 0) {
      return;
    }

    models.forEach(model => {
      const modelItem = document.createElement('div');
      modelItem.className = 'custom-model-item';
      modelItem.innerHTML = `
        <span class="model-name">${model}</span>
        <button class="delete-model-btn" data-model="${model}">&times;</button>
      `;

      customModelsContainer.appendChild(modelItem);
    });

    // 添加删除按钮事件
    document.querySelectorAll('.delete-model-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const modelToDelete = this.getAttribute('data-model');
        deleteCustomModel(modelToDelete);
      });
    });
  }

  // 初始化自定义模型下拉框
  function initCustomModelsSelect(models) {
    if (!models || models.length === 0 || !modelSelect) {
      return;
    }

    // 清除已有的自定义模型选项
    Array.from(modelSelect.options).forEach(option => {
      if (
        ![
          'black-forest-labs/FLUX.1-dev',
          'black-forest-labs/FLUX.1-schnell',
          'claude-3-7-sonnet',
          'command',
          'command-light',
          'command-light-nightly',
          'command-nightly',
          'command-r',
          'command-r-08-2024',
          'command-r-plus',
          'command-r-plus-08-2024',
          'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
          'deepseek-ai/DeepSeek-R1-Distill-Llama-8B',
          'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
          'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
          'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
          'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
          'deepseek-ai/DeepSeek-R1-fast',
          'deepseek-ai/DeepSeek-V3-0324',
          'deepseek-chat',
          'deepseek-reasoner',
          'gemini-2.0-flash',
          'gemini-2.0-flash-001',
          'gemini-2.0-flash-exp',
          'gemini-2.0-flash-exp-image-generation',
          'gemini-2.0-flash-lite',
          'gemini-2.0-flash-lite-001',
          'gemini-2.0-flash-lite-preview',
          'gemini-2.0-flash-lite-preview-02-05',
          'gemini-2.0-flash-thinking-exp',
          'gemini-2.0-flash-thinking-exp-01-21',
          'gemini-2.0-pro-exp',
          'gemini-2.0-pro-exp-02-05',
          'gemini-2.5-pro-exp-03-25',
          'gemini-exp-1206',
          'glm-4-flash',
          'google/gemma-2-27b-it-fast',
          'gpt-4o',
          'gpt-4o-mini',
          'grok-2-1212',
          'grok-2-image-1212',
          'grok-2-vision-1212',
          'grok-3-beta',
          'grok-3-fast-beta',
          'grok-3-mini-beta',
          'grok-3-mini-fast-beta',
          'grok-beta',
          'grok-vision-beta',
          'moonshot-v1-128k',
          'SparkDesk',
          'SparkDesk-v1.1',
          'SparkDesk-v2.1',
          'SparkDesk-v3.1',
          'SparkDesk-v3.5',
          'SparkDesk-v4.0',
          'xdeepseekr1',
          'yi-large',
          'yi-lightning',
        ].includes(option.value)
      ) {
        modelSelect.removeChild(option);
      }
    });

    // 添加自定义模型到下拉选择框
    models.forEach(model => {
      const exists = Array.from(modelSelect.options).some(
        option => option.value === model
      );
      if (!exists) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
      }
    });
  }

  // 添加自定义模型
  function addCustomModel() {
    const newModelName = newModelNameInput.value.trim();

    if (!newModelName) {
      showErrorMessage('请输入模型名称');
      return;
    }

    getSettings().then(settings => {
      const customModels = settings.customModels || [];

      // 检查模型是否已存在
      if (customModels.includes(newModelName)) {
        showErrorMessage('该模型名称已存在');
        return;
      }

      // 添加新模型
      customModels.push(newModelName);
      settings.customModels = customModels;

      // 保存设置
      const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.put(settings);

      request.onsuccess = function () {
        // 清空输入框
        newModelNameInput.value = '';

        // 渲染模型列表
        renderCustomModels(customModels);

        // 添加到下拉选择框
        const option = document.createElement('option');
        option.value = newModelName;
        option.textContent = newModelName;
        modelSelect.appendChild(option);
      };

      request.onerror = function (event) {
        console.error('添加自定义模型失败:', event.target.error);
        showErrorMessage('添加模型失败: ' + event.target.error);
      };
    });
  }

  // 删除自定义模型
  function deleteCustomModel(modelName) {
    getSettings().then(settings => {
      settings.customModels = (settings.customModels || []).filter(
        model => model !== modelName
      );

      // 保存设置
      const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.put(settings);

      request.onsuccess = function () {
        renderCustomModels(settings.customModels);

        // 如果删除的是当前选中的模型，则切换到默认模型
        if (modelSelect.value === modelName) {
          modelSelect.value = DEFAULT_SETTINGS.model;
        }

        // 从下拉菜单中移除
        const optionToRemove = Array.from(modelSelect.options).find(
          option => option.value === modelName
        );
        if (optionToRemove) {
          modelSelect.removeChild(optionToRemove);
        }
      };

      request.onerror = function (event) {
        console.error('删除自定义模型失败:', event.target.error);
        showErrorMessage('删除模型失败: ' + event.target.error);
      };
    });
  }

  // 加载历史记录列表
  function loadHistoryList() {
    // console.log('Attempting to load history list...'); // 日志已移除
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([HISTORY_STORE], 'readonly');
      const store = transaction.objectStore(HISTORY_STORE);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // 按时间戳降序排列

      historyList.innerHTML = '';

      const histories = [];

      request.onsuccess = function (event) {
        const cursor = event.target.result;
        if (cursor) {
          // console.log('History cursor found item:', cursor.value); // 日志已移除
          histories.push(cursor.value);
          cursor.continue();
        } else {
          // console.log('History cursor finished. Total items loaded:', histories.length, histories); // 日志已移除
          // 渲染历史记录
          if (histories.length === 0) {
            historyList.innerHTML =
              '<div class="no-history">暂无历史记录</div>';
          } else {
            histories.forEach(history => {
              const historyItem = document.createElement('div');
              historyItem.className = 'history-item';
              historyItem.innerHTML = `
                <div class="history-title">${history.title}</div>
                <div class="history-date">${new Date(
                  history.timestamp
                ).toLocaleString()}</div>
                <div class="history-actions">
                  <button class="history-action-btn load-history" data-id="${
                    history.id
                  }">加载</button>
                  <button class="history-action-btn delete-history" data-id="${
                    history.id
                  }">删除</button>
                </div>
              `;
              historyList.appendChild(historyItem);
            });

            // 添加加载历史记录事件
            document.querySelectorAll('.load-history').forEach(btn => {
              btn.addEventListener('click', function () {
                const historyId = this.getAttribute('data-id');
                loadHistoryItem(historyId);
              });
            });

            // 添加删除历史记录事件
            document.querySelectorAll('.delete-history').forEach(btn => {
              btn.addEventListener('click', function () {
                const historyId = this.getAttribute('data-id');
                deleteHistoryItem(historyId);
              });
            });
          }

          resolve(histories);
        }
      };

      request.onerror = function (event) {
        console.error(
          '加载历史记录失败 (in request.onerror):',
          event.target.error
        );
        reject(event.target.error);
      };
    });
  }

  // 加载历史记录项
  function loadHistoryItem(id) {
    const transaction = db.transaction([HISTORY_STORE], 'readonly');
    const store = transaction.objectStore(HISTORY_STORE);
    const request = store.get(id);

    request.onsuccess = function (event) {
      const history = event.target.result;
      if (history) {
        // 填充表单
        workerNameInput.value = history.data.workerName || '';
        workerIdCardInput.value = history.data.workerIdCard || '';
        workerAddressInput.value = history.data.workerAddress || '';
        employerNameInput.value = history.data.employerName || '';
        employerRepNameInput.value = history.data.employerRepName || '';
        employerRepIdInput.value = history.data.employerRepId || '';
        otherEvidenceInput.value = history.data.otherEvidence || '';

        // 处理可选金额字段
        if (history.data.hasSalaryAmount) {
          hasSalaryAmountCheckbox.checked = true;
          salaryAmountInput.disabled = false;
          salaryAmountInput.value = history.data.salaryAmount || '';
        } else {
          hasSalaryAmountCheckbox.checked = false;
          salaryAmountInput.disabled = true;
          salaryAmountInput.value = '';
        }

        if (history.data.hasCompensationAmount) {
          hasCompensationAmountCheckbox.checked = true;
          compensationAmountInput.disabled = false;
          compensationAmountInput.value = history.data.compensationAmount || '';
        } else {
          hasCompensationAmountCheckbox.checked = false;
          compensationAmountInput.disabled = true;
          compensationAmountInput.value = '';
        }

        otherDemandsInput.value = history.data.otherDemands || '';

        // 清除所有证据复选框
        document
          .querySelectorAll('.evidence-checkboxes input[type="checkbox"]')
          .forEach(checkbox => {
            checkbox.checked = false;
          });

        // 勾选相应的证据
        if (
          history.data.selectedEvidence &&
          history.data.selectedEvidence.length > 0
        ) {
          history.data.selectedEvidence.forEach(evidence => {
            const checkbox = document.querySelector(
              `.evidence-checkboxes input[value="${evidence}"]`
            );
            if (checkbox) {
              checkbox.checked = true;
            }
          });
        }

        // 显示结果到新的历史详情弹窗
        try {
          renderMarkdownToElement(
            history.result || '',
            'historicalResultContent'
          );
        } catch (parseError) {
          console.error('历史记录Markdown渲染失败:', parseError);
          showErrorMessage('历史记录渲染出错');
        }

        // Ensure historyModal is behind historicalResultModal if both are somehow active
        if (historyModal.classList.contains('active')) {
          historyModal.style.zIndex = '1000';
        }
        historicalResultModal.style.zIndex = '1001';
        historicalResultModal.classList.add('active');

        // Keep historyModal open as per previous request
        // historyModal.classList.remove('active');
      }
    };

    request.onerror = function (event) {
      console.error('加载历史记录项失败:', event.target.error);
      showErrorMessage('加载历史记录项失败: ' + event.target.error.message);
    };
  }

  // 删除历史记录项
  function deleteHistoryItem(id) {
    showConfirmModal(
      '删除确认',
      '确定要删除该条历史记录吗？此操作不可撤销。',
      () => {
        const transaction = db.transaction([HISTORY_STORE], 'readwrite');
        const store = transaction.objectStore(HISTORY_STORE);
        const request = store.delete(id);

        request.onsuccess = function () {
          loadHistoryList(); // 重新加载列表
        };

        request.onerror = function (event) {
          console.error('删除历史记录项失败:', event.target.error);
          showErrorMessage('删除历史记录失败: ' + event.target.error);
        };
      }
    );
  }

  // 清空历史记录
  function clearHistory() {
    showConfirmModal(
      '清空确认',
      '确定要清空所有历史记录吗？此操作不可撤销。',
      () => {
        const transaction = db.transaction([HISTORY_STORE], 'readwrite');
        const store = transaction.objectStore(HISTORY_STORE);
        const request = store.clear();

        request.onsuccess = function () {
          historyList.innerHTML = '<div class="no-history">暂无历史记录</div>';
        };

        request.onerror = function (event) {
          console.error('清空历史记录失败:', event.target.error);
          showErrorMessage('清空历史记录失败: ' + event.target.error);
        };
      }
    );
  }

  // 新增：显示确认弹窗的辅助函数
  function showConfirmModal(title, message, onConfirm) {
    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    currentOnConfirmCallback = onConfirm;

    // 设置较高的z-index确保确认弹窗显示在最上层
    confirmModal.style.zIndex = '1100'; // 高于historyModal的z-index
    confirmModal.classList.add('active');
  }

  // 生成唯一ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  // 保存结果
  function saveResult() {
    // console.log('saveResult function called'); // 日志已移除

    // 收集当前表单数据
    const consultationData = {
      workerName: workerNameInput.value.trim(),
      workerIdCard: workerIdCardInput.value.trim(),
      workerAddress: workerAddressInput.value.trim(),
      employerName: employerNameInput.value.trim(),
      employerRepName: employerRepNameInput.value.trim(),
      employerRepId: employerRepIdInput.value.trim(),
      selectedEvidence: Array.from(
        document.querySelectorAll(
          '.evidence-checkboxes input[type="checkbox"]:checked'
        )
      ).map(checkbox => checkbox.value),
      otherEvidence: otherEvidenceInput.value.trim(),
      hasSalaryAmount: hasSalaryAmountCheckbox.checked,
      salaryAmount: hasSalaryAmountCheckbox.checked
        ? salaryAmountInput.value.trim()
        : '',
      hasCompensationAmount: hasCompensationAmountCheckbox.checked,
      compensationAmount: hasCompensationAmountCheckbox.checked
        ? compensationAmountInput.value.trim()
        : '',
      otherDemands: otherDemandsInput.value.trim(),
    };

    // 创建历史记录
    const history = {
      id: generateId(),
      title: `${consultationData.workerName}诉${consultationData.employerName}劳动争议`,
      data: consultationData,
      result: accumulatedMarkdown || resultContent.innerText, // 保存原始markdown而不是innerHTML
      timestamp: Date.now(),
    };

    // 保存到IndexedDB
    const transaction = db.transaction([HISTORY_STORE], 'readwrite');
    const store = transaction.objectStore(HISTORY_STORE);
    const request = store.add(history);

    request.onsuccess = function () {
      // console.log('History item saved successfully to IndexedDB:', history); // 日志已移除
      showSuccessMessage('咨询结果已保存到历史记录！'); // 使用新的成功提示函数
    };

    request.onerror = function (event) {
      console.error('保存历史记录到 IndexedDB 失败:', event.target.error);
      showErrorMessage('保存咨询结果失败: ' + event.target.error.message);
    };
  }

  // 重置表单
  function resetForm() {
    legalForm.reset();

    // 重置复选框状态和输入框禁用状态
    if (hasSalaryAmountCheckbox && salaryAmountInput) {
      hasSalaryAmountCheckbox.checked = false;
      salaryAmountInput.disabled = true;
    }

    if (hasCompensationAmountCheckbox && compensationAmountInput) {
      hasCompensationAmountCheckbox.checked = false;
      compensationAmountInput.disabled = true;
    }
  }

  // 关闭结果弹窗
  function closeResultModal() {
    // 停止定期渲染
    stopPeriodicRendering();

    resultModal.style.zIndex = ''; // Reset z-index
    resultModal.classList.remove('active');

    // 确保按钮状态正确，即使AI仍在后台生成
    submitLegalFormBtn.disabled = false;
    saveResultBtn.disabled = false;
    printResultBtn.disabled = false;
    submitLegalFormBtn.style.opacity = '1';
    submitLegalFormBtn.style.cursor = 'pointer';

    // If AI was generating and user closes, we might want to abort.
    // However, current logic aborts on new submission or continues in background.
    // For now, just closing the view is fine.
  }

  // 新增：历史结果弹窗关闭按钮事件
  if (closeHistoricalResultModalBtn) {
    closeHistoricalResultModalBtn.addEventListener('click', () => {
      console.log('closeHistoricalResultModalBtn (header X) clicked');
      closeHistoricalResultModal();
    });
  }
  if (closeHistoricalResultModalFooterBtn) {
    closeHistoricalResultModalFooterBtn.addEventListener('click', () => {
      console.log(
        'closeHistoricalResultModalFooterBtn (footer button) clicked'
      );
      closeHistoricalResultModal();
    });
  }

  // 新增：关闭历史记录结果展示弹窗
  function closeHistoricalResultModal() {
    console.log(
      'closeHistoricalResultModal function called. Current classes:',
      historicalResultModal.className,
      'Current zIndex:',
      historicalResultModal.style.zIndex
    );
    historicalResultModal.style.zIndex = ''; // Reset z-index
    historicalResultModal.classList.remove('active');
    console.log(
      'After attempting close. Current classes:',
      historicalResultModal.className
    );
    // Check if historyModal is still active and should regain top focus among a certain group
    if (
      historyModal.classList.contains('active') &&
      !resultModal.classList.contains('active')
    ) {
      // If only history list is left from the interaction, ensure its z-index is appropriate or reset
      // historyModal.style.zIndex = '1000'; // or simply rely on its own open/close logic to set z-index
      console.log('History modal is still active.');
    } else {
      console.log(
        'History modal is not active, or another primary modal (resultModal) is active.'
      );
    }
  }

  // 打印结果
  function printResult() {
    // This is for the main result modal
    printContent(resultContent.innerHTML, '法律咨询结果');
  }

  // 新增：历史结果打印按钮事件
  if (printHistoricalResultBtn) {
    printHistoricalResultBtn.addEventListener('click', () => {
      // Create a generic print function or adapt existing printResult
      printContent(historicalResultContent.innerHTML, '历史咨询详情');
    });
  }

  // 泛用的打印函数
  function printContent(innerHTML, title) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .result-header { text-align: center; margin-bottom: 20px; }
          .section { margin-bottom: 20px; }
          h3, h4, h5 { margin-top: 15px; margin-bottom: 10px; }
          ul, ol { margin-left: 20px; }
          .timeline-item { display: flex; margin-bottom: 15px; }
          .timeline-marker { background: #2563eb; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px; flex-shrink: 0; }
          .timeline-content { flex: 1; }
          .result-footer { margin-top: 30px; font-size: 0.9em; color: #666; }
        </style>
      </head>
      <body>
        ${innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  // 加载示例案例
  function loadExampleCase(caseType) {
    // 清空表单
    resetForm();

    // 根据案例类型填充表单
    switch (caseType) {
      case 'wage':
        workerNameInput.value = '张三';
        workerIdCardInput.value = '320123********1234';
        workerAddressInput.value = '江苏省盐城市';
        employerNameInput.value = '某建筑有限公司';
        employerRepNameInput.value = '李经理';

        // 勾选相关证据
        document.getElementById('contract').checked = true;
        document.getElementById('timecard').checked = true;
        document.getElementById('bankrecord').checked = true;
        document.getElementById('messages').checked = true;

        // 设置金额字段
        hasSalaryAmountCheckbox.checked = true;
        salaryAmountInput.disabled = false;
        salaryAmountInput.value = '12000';

        hasCompensationAmountCheckbox.checked = true;
        compensationAmountInput.disabled = false;
        compensationAmountInput.value = '3000';
        break;

      case 'injury':
        workerNameInput.value = '李四';
        workerIdCardInput.value = '330123********5678';
        workerAddressInput.value = '江苏省盐城市';
        employerNameInput.value = '某制造有限公司';
        employerRepNameInput.value = '王经理';

        // 勾选相关证据
        document.getElementById('contract').checked = true;
        document.getElementById('witness').checked = true;
        document.getElementById('photos').checked = true;

        otherEvidenceInput.value = '工伤认定书、医疗诊断证明、医疗费用收据';

        // 设置金额字段
        hasSalaryAmountCheckbox.checked = true;
        salaryAmountInput.disabled = false;
        salaryAmountInput.value = '5000';

        hasCompensationAmountCheckbox.checked = true;
        compensationAmountInput.disabled = false;
        compensationAmountInput.value = '50000';

        otherDemandsInput.value = '要求支付医疗费、误工费、护理费、伙食补助费';
        break;

      case 'dismiss':
        workerNameInput.value = '王五';
        workerIdCardInput.value = '410123********9012';
        workerAddressInput.value = '江苏省盐城市';
        employerNameInput.value = '某服务有限公司';
        employerRepNameInput.value = '赵经理';

        // 勾选相关证据
        document.getElementById('contract').checked = true;
        document.getElementById('timecard').checked = true;
        document.getElementById('messages').checked = true;

        otherEvidenceInput.value = '解雇通知书';

        // 设置金额字段
        hasSalaryAmountCheckbox.checked = true;
        salaryAmountInput.disabled = false;
        salaryAmountInput.value = '8000';

        hasCompensationAmountCheckbox.checked = true;
        compensationAmountInput.disabled = false;
        compensationAmountInput.value = '24000';

        otherDemandsInput.value = '要求依法支付违法解除劳动合同赔偿金';
        break;

      case 'contract':
        workerNameInput.value = '赵六';
        workerIdCardInput.value = '500123********3456';
        workerAddressInput.value = '江苏省盐城市';
        employerNameInput.value = '某餐饮有限公司';
        employerRepNameInput.value = '钱经理';

        // 勾选相关证据
        document.getElementById('bankrecord').checked = true;
        document.getElementById('photos').checked = true;
        document.getElementById('witness').checked = true;
        document.getElementById('messages').checked = true;

        // 设置金额字段
        hasSalaryAmountCheckbox.checked = true;
        salaryAmountInput.disabled = false;
        salaryAmountInput.value = '15000';

        hasCompensationAmountCheckbox.checked = true;
        compensationAmountInput.disabled = false;
        compensationAmountInput.value = '10000';

        otherDemandsInput.value = '要求支付未签订书面劳动合同的双倍工资差额';
        break;
    }
  }

  // 获取争议类型
  function getDisputeType(data) {
    if (data.otherDemands && data.otherDemands.includes('工伤')) {
      return '工伤赔偿';
    } else if (data.otherDemands && data.otherDemands.includes('解除')) {
      return '违法解除劳动合同';
    } else if (data.otherDemands && data.otherDemands.includes('双倍工资')) {
      return '未订立书面劳动合同';
    } else {
      return '劳动报酬';
    }
  }
});
