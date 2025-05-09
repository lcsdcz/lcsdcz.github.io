// 渲染自定义模型列表
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

  // 添加删除按钮事件监听
  document.querySelectorAll('.delete-model-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const modelToDelete = btn.getAttribute('data-model');
      try {
        const settings = await getSettings();
        settings.customModels = (settings.customModels || []).filter(
          model => model !== modelToDelete
        );
        await saveSettings(settings);
        renderCustomModels(settings.customModels);

        // 如果删除的是当前选中的模型，则切换到默认模型
        if (modelSelect.value === modelToDelete) {
          modelSelect.value = DEFAULT_SETTINGS.model;
        }

        // 从下拉菜单中移除
        const optionToRemove = Array.from(modelSelect.options).find(
          option => option.value === modelToDelete
        );
        if (optionToRemove) {
          modelSelect.removeChild(optionToRemove);
        }
      } catch (error) {
        console.error('删除自定义模型失败:', error);
        showErrorMessage('删除模型失败: ' + error.message);
      }
    });
  });
}

// 添加新的自定义模型
async function addCustomModel() {
  const newModelName = newModelNameInput.value.trim();

  if (!newModelName) {
    showErrorMessage('请输入模型名称');
    return;
  }

  try {
    const settings = await getSettings();
    const customModels = settings.customModels || [];

    // 检查模型是否已存在
    if (customModels.includes(newModelName)) {
      showErrorMessage('该模型名称已存在');
      return;
    }

    // 添加新模型
    customModels.push(newModelName);
    settings.customModels = customModels;
    await saveSettings(settings);

    // 清空输入框
    newModelNameInput.value = '';

    // 渲染模型列表
    renderCustomModels(customModels);

    // 添加到下拉选择框
    const option = document.createElement('option');
    option.value = newModelName;
    option.textContent = newModelName;
    modelSelect.appendChild(option);
  } catch (error) {
    console.error('添加自定义模型失败:', error);
    showErrorMessage('添加模型失败: ' + error.message);
  }
}

// 添加自定义模型按钮点击事件
addModelBtn.addEventListener('click', addCustomModel);

// 添加键盘事件支持，按下Enter键添加模型
newModelNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCustomModel();
  }
});
