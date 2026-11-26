function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function createSettingsPanelManager({
    settingsPanel,
    settingAiProvider,
    geminiSettingsGroup,
    ollamaSettingsGroup,
    antigravitySettingsGroup,
    settingAntigravityModel,
    refreshAntigravityModelsBtn,
    opencodeSettingsGroup,
    settingOpencodeModel,
    syncOpencodeModelsBtn,
    opencodeFreeOnlyToggle,
    opencodeSetupStatus,
    cliAgentSettingsGroup,
    settingCliAgentType,
    settingCliAgentCmd,
    cliAgentCustomGroup,
    settingGeminiKey,
    toggleGeminiKeyVisibilityBtn,
    settingGeminiModel,
    settingProgrammingLanguage,
    settingOllamaBaseUrl,
    settingOllamaModel,
    settingOllamaModelSelect,
    fetchOllamaModelsBtn,
    settingAssemblyKey,
    toggleAssemblyKeyVisibilityBtn,
    settingAssemblyModel,
    settingWindowOpacity,
    settingWindowOpacityValue,
    settingCandidateResume,
    settingJobDescription,
    applySettingsShortcutConfig,
    showFeedback,
    onSettingsSaved
}) {
    function normalizeWindowOpacityLevel(value) {
        const parsedValue = Number.parseInt(String(value ?? ''), 10);

        if (!Number.isFinite(parsedValue)) {
            return 10;
        }

        return clamp(parsedValue, 1, 10);
    }

    function updateWindowOpacityValueLabel(value) {
        if (!settingWindowOpacityValue) {
            return;
        }

        const opacityLevel = normalizeWindowOpacityLevel(value);
        settingWindowOpacityValue.textContent = `${opacityLevel}/10`;
    }

    function setApiKeyFieldVisibility(inputElement, toggleButton, providerName, visible) {
        if (!inputElement || !toggleButton) {
            return;
        }

        const shouldShow = Boolean(visible);
        inputElement.type = shouldShow ? 'text' : 'password';
        toggleButton.textContent = shouldShow ? 'Hide' : 'Show';
        toggleButton.setAttribute('aria-pressed', shouldShow ? 'true' : 'false');
        toggleButton.setAttribute(
            'aria-label',
            `${shouldShow ? 'Hide' : 'Show'} ${providerName} API key`
        );
    }

    function bindApiKeyVisibilityToggle(inputElement, toggleButton, providerName) {
        if (!inputElement || !toggleButton) {
            return;
        }

        setApiKeyFieldVisibility(inputElement, toggleButton, providerName, false);
        toggleButton.addEventListener('click', () => {
            const nextVisible = inputElement.type !== 'text';
            setApiKeyFieldVisibility(inputElement, toggleButton, providerName, nextVisible);
        });
    }

    let cachedOpenCodeEntries = [];
    let selectedOpenCodeModel = '';

    function updateProviderVisibility(provider) {
        const isGemini = provider === 'gemini';
        const isOllama = provider === 'ollama';
        const isAntigravity = provider === 'antigravity';
        const isOpenCode = provider === 'opencode';
        const isCliAgent = provider === 'codex' || provider === 'claude-code';

        if (geminiSettingsGroup) {
            geminiSettingsGroup.classList.toggle('hidden', !isGemini);
        }
        if (ollamaSettingsGroup) {
            ollamaSettingsGroup.classList.toggle('hidden', !isOllama);
        }
        if (antigravitySettingsGroup) {
            antigravitySettingsGroup.classList.toggle('hidden', !isAntigravity);
        }
        if (opencodeSettingsGroup) {
            opencodeSettingsGroup.classList.toggle('hidden', !isOpenCode);
        }
        if (cliAgentSettingsGroup) {
            cliAgentSettingsGroup.classList.toggle('hidden', !isCliAgent);
        }
    }

    function updateOpenCodeStatus(status) {
        if (!opencodeSetupStatus || !status) {
            return;
        }
        const stage = String(status.stage || '');
        const message = String(status.message || '').trim();
        if (message) {
            opencodeSetupStatus.textContent = message;
        }
        if (stage === 'error') {
            opencodeSetupStatus.style.color = '#f87171';
        } else if (stage === 'ready') {
            opencodeSetupStatus.style.color = '#48bb78';
        } else {
            opencodeSetupStatus.style.color = '#60a5fa';
        }
    }

    function bindProviderToggle() {
        if (!settingAiProvider) {
            return;
        }

        settingAiProvider.addEventListener('change', () => {
            const nextProvider = settingAiProvider.value;
            updateProviderVisibility(nextProvider);
            if (nextProvider === 'antigravity' && settingAntigravityModel && settingAntigravityModel.options.length === 0) {
                refreshAntigravityModels();
            } else if (nextProvider === 'opencode' && cachedOpenCodeEntries.length === 0) {
                syncOpenCodeModels();
            }
        });
    }

    async function fetchOllamaModels() {
        if (!settingOllamaBaseUrl || !settingOllamaModelSelect) {
            return;
        }

        const baseUrl = settingOllamaBaseUrl.value.trim() || 'http://localhost:11434';

        try {
            if (fetchOllamaModelsBtn) {
                fetchOllamaModelsBtn.textContent = '...';
                fetchOllamaModelsBtn.disabled = true;
            }

            const response = await fetch(`${baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`Ollama API returned ${response.status}`);
            }

            const data = await response.json();
            const models = Array.isArray(data.models) ? data.models : [];

            if (models.length === 0) {
                showFeedback?.('No models found. Pull a model first with: ollama pull <model>', 'error');
                return;
            }

            settingOllamaModelSelect.innerHTML = '';
            models.forEach((model) => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.name;
                settingOllamaModelSelect.appendChild(option);
            });

            // Pre-select current model if it's in the list
            const currentModel = settingOllamaModel ? settingOllamaModel.value.trim() : '';
            const modelNames = models.map((m) => m.name);
            if (currentModel && modelNames.includes(currentModel)) {
                settingOllamaModelSelect.value = currentModel;
            }

            settingOllamaModelSelect.classList.remove('hidden');

            // When user picks from dropdown, update the text input
            settingOllamaModelSelect.addEventListener('change', () => {
                if (settingOllamaModel) {
                    settingOllamaModel.value = settingOllamaModelSelect.value;
                }
            }, { once: false });

            showFeedback?.(`Found ${models.length} model(s). Select one from the dropdown.`, 'success');
        } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            showFeedback?.(`Could not reach Ollama at ${baseUrl}. Is it running?`, 'error');
        } finally {
            if (fetchOllamaModelsBtn) {
                fetchOllamaModelsBtn.textContent = 'Fetch';
                fetchOllamaModelsBtn.disabled = false;
            }
        }
    }

    function bindFetchOllamaModels() {
        if (!fetchOllamaModelsBtn) {
            return;
        }

        fetchOllamaModelsBtn.addEventListener('click', () => {
            fetchOllamaModels();
        });
    }

    function populateGeminiModelOptions(models, selectedModel) {
        if (!settingGeminiModel) {
            return;
        }

        settingGeminiModel.innerHTML = '';

        const configuredModels = Array.isArray(models) ? models : [];
        if (configuredModels.length === 0) {
            throw new Error('Gemini models are not configured.');
        }

        configuredModels.forEach((modelName) => {
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            settingGeminiModel.appendChild(option);
        });

        settingGeminiModel.value = configuredModels.includes(selectedModel)
            ? selectedModel
            : configuredModels[0];
    }

    function populateAntigravityModelOptions(modelsOrEntries, selectedModel) {
        if (!settingAntigravityModel) {
            return;
        }

        settingAntigravityModel.innerHTML = '';
        const items = Array.isArray(modelsOrEntries) ? modelsOrEntries : [];
        if (items.length === 0) {
            const placeholder = document.createElement('option');
            placeholder.value = selectedModel || '';
            placeholder.textContent = selectedModel || 'No models discovered (click Refresh)';
            settingAntigravityModel.appendChild(placeholder);
            return;
        }

        const ids = [];
        items.forEach((entry) => {
            const id = typeof entry === 'string' ? entry : String(entry?.id || '').trim();
            const label = typeof entry === 'string' ? entry : String(entry?.name || id).trim();
            if (!id) return;
            ids.push(id);
            const option = document.createElement('option');
            option.value = id;
            option.textContent = label;
            settingAntigravityModel.appendChild(option);
        });

        if (ids.length > 0) {
            settingAntigravityModel.value = ids.includes(selectedModel)
                ? selectedModel
                : ids[0];
        }
    }

    function populateOpenCodeModelOptions(entries, selectedModel) {
        if (!settingOpencodeModel) {
            return;
        }

        const list = Array.isArray(entries) ? entries : [];
        cachedOpenCodeEntries = list;
        if (selectedModel) {
            selectedOpenCodeModel = selectedModel;
        }

        settingOpencodeModel.innerHTML = '';
        const freeOnly = Boolean(opencodeFreeOnlyToggle?.checked);
        const freeEntries = list.filter((e) => e.isFree);
        const visible = (freeOnly && freeEntries.length > 0) ? freeEntries : list;

        if (visible.length === 0) {
            const placeholder = document.createElement('option');
            placeholder.value = selectedOpenCodeModel || '';
            placeholder.textContent = selectedOpenCodeModel || 'Syncing OpenCode models...';
            settingOpencodeModel.appendChild(placeholder);
            return;
        }

        const ids = [];
        visible.forEach((entry) => {
            const id = String(entry?.id || '').trim();
            if (!id) return;
            ids.push(id);
            const option = document.createElement('option');
            option.value = id;
            const baseLabel = String(entry?.name || id).trim();
            option.textContent = entry?.isFree ? `${baseLabel} [Free]` : baseLabel;
            settingOpencodeModel.appendChild(option);
        });

        if (ids.length > 0) {
            settingOpencodeModel.value = ids.includes(selectedOpenCodeModel)
                ? selectedOpenCodeModel
                : ids[0];
        }
    }

    async function refreshAntigravityModels() {
        if (!window.electronAPI?.refreshAntigravityModels) {
            return;
        }
        try {
            if (refreshAntigravityModelsBtn) {
                refreshAntigravityModelsBtn.textContent = '...';
                refreshAntigravityModelsBtn.disabled = true;
            }
            const res = await window.electronAPI.refreshAntigravityModels();
            if (res?.success) {
                const entries = (res.entries && res.entries.length > 0) ? res.entries : res.models;
                populateAntigravityModelOptions(
                    entries,
                    settingAntigravityModel?.value || res.activeModel || res.defaultModel
                );
                if (res.models?.length > 0) {
                    showFeedback?.(`Discovered ${res.models.length} Antigravity model(s).`, 'success');
                } else {
                    showFeedback?.('No Antigravity models found. Is agy CLI signed in?', 'error');
                }
            }
        } catch (error) {
            console.error('Failed to refresh Antigravity models:', error);
        } finally {
            if (refreshAntigravityModelsBtn) {
                refreshAntigravityModelsBtn.textContent = 'Refresh';
                refreshAntigravityModelsBtn.disabled = false;
            }
        }
    }

    async function syncOpenCodeModels() {
        if (!window.electronAPI?.ensureOpenCodeReady) {
            return;
        }
        try {
            if (syncOpencodeModelsBtn) {
                syncOpencodeModelsBtn.textContent = '...';
                syncOpencodeModelsBtn.disabled = true;
            }
            updateOpenCodeStatus({ stage: 'checking', message: 'Checking & syncing OpenCode CLI...' });
            const res = await window.electronAPI.ensureOpenCodeReady();
            if (res?.success) {
                const entries = Array.isArray(res.entries) ? res.entries : [];
                populateOpenCodeModelOptions(entries, settingOpencodeModel?.value || res.activeModel || res.defaultModel);
                const freeCount = Array.isArray(res.freeModels) ? res.freeModels.length : 0;
                updateOpenCodeStatus({
                    stage: 'ready',
                    message: `OpenCode ready (${freeCount} free / ${entries.length} total models)`
                });
            } else {
                updateOpenCodeStatus({
                    stage: 'error',
                    message: res?.error || 'OpenCode setup failed.'
                });
            }
        } catch (error) {
            console.error('Failed to sync OpenCode:', error);
            updateOpenCodeStatus({ stage: 'error', message: error.message });
        } finally {
            if (syncOpencodeModelsBtn) {
                syncOpencodeModelsBtn.textContent = 'Sync';
                syncOpencodeModelsBtn.disabled = false;
            }
        }
    }

    function populateProgrammingLanguageOptions(languages, selectedLanguage) {
        if (!settingProgrammingLanguage) {
            return;
        }

        settingProgrammingLanguage.innerHTML = '';

        const configuredLanguages = Array.isArray(languages) ? languages : [];
        if (configuredLanguages.length === 0) {
            throw new Error('Programming languages are not configured.');
        }

        configuredLanguages.forEach((languageName) => {
            const option = document.createElement('option');
            option.value = languageName;
            option.textContent = languageName;
            settingProgrammingLanguage.appendChild(option);
        });

        settingProgrammingLanguage.value = configuredLanguages.includes(selectedLanguage)
            ? selectedLanguage
            : configuredLanguages[0];
    }

    function populateAssemblyAiSpeechModelOptions(models, selectedModel) {
        if (!settingAssemblyModel) {
            return;
        }

        settingAssemblyModel.innerHTML = '';

        const configuredModels = Array.isArray(models) ? models : [];
        if (configuredModels.length === 0) {
            throw new Error('AssemblyAI speech models are not configured.');
        }

        configuredModels.forEach((modelName) => {
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            settingAssemblyModel.appendChild(option);
        });

        settingAssemblyModel.value = configuredModels.includes(selectedModel)
            ? selectedModel
            : configuredModels[0];
    }

    async function openSettings() {
        if (!settingsPanel) {
            return;
        }

        try {
            const settings = await window.electronAPI.getSettings();
            if (settings && !settings.error) {
                applySettingsShortcutConfig?.(settings);

                // AI Provider
                const activeProvider = settings.aiProvider || 'gemini';
                if (settingAiProvider) {
                    settingAiProvider.value = activeProvider;
                }
                updateProviderVisibility(activeProvider);

                // Gemini settings
                if (settingGeminiKey) settingGeminiKey.value = settings.geminiApiKey || '';
                populateGeminiModelOptions(settings.geminiModels, settings.geminiModel || settings.defaultGeminiModel);

                // Antigravity settings
                const agEntries = (Array.isArray(settings.antigravityModelEntries) && settings.antigravityModelEntries.length > 0)
                    ? settings.antigravityModelEntries
                    : settings.antigravityModels;
                populateAntigravityModelOptions(agEntries, settings.antigravityModel || settings.defaultAntigravityModel);

                // OpenCode settings
                const ocEntries = Array.isArray(settings.opencodeModelEntries) ? settings.opencodeModelEntries : [];
                populateOpenCodeModelOptions(ocEntries, settings.opencodeModel || settings.defaultOpenCodeModel);
                if (settings.opencodeInstalled && ocEntries.length > 0) {
                    const freeCount = Array.isArray(settings.freeOpenCodeModels) ? settings.freeOpenCodeModels.length : 0;
                    updateOpenCodeStatus({
                        stage: 'ready',
                        message: `OpenCode CLI connected (${freeCount} free / ${ocEntries.length} total models)`
                    });
                } else if (settings.opencodeInstalled) {
                    updateOpenCodeStatus({
                        stage: 'configuring',
                        message: 'OpenCode CLI installed. Click Sync to refresh models.'
                    });
                } else {
                    updateOpenCodeStatus({
                        stage: 'checking',
                        message: 'OpenCode CLI will auto-install when selected or synced.'
                    });
                }

                // Ollama settings
                if (settingOllamaBaseUrl) settingOllamaBaseUrl.value = settings.ollamaBaseUrl || 'http://localhost:11434';
                if (settingOllamaModel) settingOllamaModel.value = settings.ollamaModel || 'llama3.2';
                if (settingOllamaModelSelect) settingOllamaModelSelect.classList.add('hidden');

                // CLI Agent settings
                if (settingCliAgentType && settings.cliAgentType) {
                    settingCliAgentType.value = settings.cliAgentType;
                }
                if (settingCliAgentCmd) {
                    settingCliAgentCmd.value = settings.cliAgentCmd || '';
                }
                if (cliAgentCustomGroup && settingCliAgentType) {
                    cliAgentCustomGroup.classList.toggle('hidden', settingCliAgentType.value !== 'custom');
                }

                populateProgrammingLanguageOptions(
                    settings.programmingLanguages,
                    settings.programmingLanguage || settings.defaultProgrammingLanguage
                );
                if (settingAssemblyKey) settingAssemblyKey.value = settings.assemblyAiApiKey || '';
                populateAssemblyAiSpeechModelOptions(
                    settings.assemblyAiSpeechModels,
                    settings.assemblyAiSpeechModel || settings.defaultAssemblyAiSpeechModel
                );
                if (settingWindowOpacity) {
                    settingWindowOpacity.value = normalizeWindowOpacityLevel(settings.windowOpacityLevel);
                }
                updateWindowOpacityValueLabel(settings.windowOpacityLevel);

                if (settingCandidateResume) settingCandidateResume.value = settings.candidateResume || '';
                if (settingJobDescription) settingJobDescription.value = settings.jobDescription || '';
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        setApiKeyFieldVisibility(settingGeminiKey, toggleGeminiKeyVisibilityBtn, 'Gemini', false);
        setApiKeyFieldVisibility(settingAssemblyKey, toggleAssemblyKeyVisibilityBtn, 'AssemblyAI', false);

        settingsPanel.classList.remove('hidden');
    }

    function closeSettings() {
        if (settingsPanel) {
            settingsPanel.classList.add('hidden');
        }

        setApiKeyFieldVisibility(settingGeminiKey, toggleGeminiKeyVisibilityBtn, 'Gemini', false);
        setApiKeyFieldVisibility(settingAssemblyKey, toggleAssemblyKeyVisibilityBtn, 'AssemblyAI', false);
    }

    async function saveSettings() {
        try {
            const aiProvider = settingAiProvider ? settingAiProvider.value : 'gemini';

            if (aiProvider === 'gemini') {
                if (!settingGeminiModel || settingGeminiModel.options.length === 0) {
                    throw new Error('Gemini models are not configured.');
                }
            }

            if (!settingProgrammingLanguage || settingProgrammingLanguage.options.length === 0) {
                throw new Error('Programming languages are not configured.');
            }

            if (!settingAssemblyModel || settingAssemblyModel.options.length === 0) {
                throw new Error('AssemblyAI speech models are not configured.');
            }

            const settings = {
                aiProvider,
                geminiApiKey: settingGeminiKey ? settingGeminiKey.value.trim() : '',
                assemblyAiApiKey: settingAssemblyKey ? settingAssemblyKey.value.trim() : '',
                geminiModel: settingGeminiModel ? settingGeminiModel.value : '',
                antigravityModel: settingAntigravityModel ? settingAntigravityModel.value : '',
                opencodeModel: settingOpencodeModel ? settingOpencodeModel.value : '',
                ollamaBaseUrl: settingOllamaBaseUrl ? settingOllamaBaseUrl.value.trim() : '',
                ollamaModel: settingOllamaModel ? settingOllamaModel.value.trim() : '',
                cliAgentType: settingCliAgentType ? settingCliAgentType.value : 'codex',
                cliAgentCmd: settingCliAgentCmd ? settingCliAgentCmd.value.trim() : '',
                programmingLanguage: settingProgrammingLanguage.value,
                assemblyAiSpeechModel: settingAssemblyModel.value,
                windowOpacityLevel: normalizeWindowOpacityLevel(settingWindowOpacity?.value),
                candidateResume: settingCandidateResume ? settingCandidateResume.value.trim() : '',
                jobDescription: settingJobDescription ? settingJobDescription.value.trim() : ''
            };

            const result = await window.electronAPI.saveSettings(settings);

            if (result.success) {
                showFeedback?.('Settings saved. Latest AI settings are active now; voice model applies next session.', 'success');
                onSettingsSaved?.(settings);
                closeSettings();
                return { success: true, settings };
            } else {
                showFeedback?.(`Failed to save: ${result.error}`, 'error');
                return { success: false, error: result.error || 'Failed to save settings' };
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            showFeedback?.('Failed to save settings', 'error');
            return { success: false, error: error.message || 'Failed to save settings' };
        }
    }

    bindApiKeyVisibilityToggle(settingGeminiKey, toggleGeminiKeyVisibilityBtn, 'Gemini');
    bindApiKeyVisibilityToggle(settingAssemblyKey, toggleAssemblyKeyVisibilityBtn, 'AssemblyAI');
    bindProviderToggle();
    bindFetchOllamaModels();

    if (refreshAntigravityModelsBtn) {
        refreshAntigravityModelsBtn.addEventListener('click', () => {
            refreshAntigravityModels();
        });
    }

    if (syncOpencodeModelsBtn) {
        syncOpencodeModelsBtn.addEventListener('click', () => {
            syncOpenCodeModels();
        });
    }

    if (opencodeFreeOnlyToggle) {
        opencodeFreeOnlyToggle.addEventListener('change', () => {
            populateOpenCodeModelOptions(cachedOpenCodeEntries, settingOpencodeModel?.value || selectedOpenCodeModel);
        });
    }

    if (settingCliAgentType) {
        settingCliAgentType.addEventListener('change', () => {
            if (cliAgentCustomGroup) {
                cliAgentCustomGroup.classList.toggle('hidden', settingCliAgentType.value !== 'custom');
            }
        });
    }

    return {
        normalizeWindowOpacityLevel,
        updateWindowOpacityValueLabel,
        updateOpenCodeStatus,
        openSettings,
        closeSettings,
        saveSettings
    };
}
