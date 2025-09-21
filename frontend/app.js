document.addEventListener('DOMContentLoaded', () => {
    const { jsPDF } = window.jspdf;
    lucide.createIcons();

    // API Configuration - Use relative URL for Docker setup
    const API_BASE_URL = '/api';

    // --- Element Refs ---
    const getEl = (id) => document.getElementById(id);
    const panelContainer = getEl('panel-container');
    const inspectorPanel = getEl('inspector-panel');
    const manageLibraryBtn = getEl('manage-library-btn'), libraryModal = getEl('library-modal'), libraryModalCloseBtn = getEl('library-modal-close-btn'), libraryFileInput = getEl('library-file-input'), libraryModalGrid = getEl('library-modal-grid'), librarySidebarContainer = getEl('library-sidebar-container');
    const styleSelector = getEl('style-selector'), generateStyleBtn = getEl('generate-style-btn'), uploadStyleBtn = getEl('upload-style-btn'), styleFileInput = getEl('style-file-input'), styleRefContainer = getEl('style-ref-container'), styleRefImg = getEl('style-ref-img'), removeStyleBtn = getEl('remove-style-btn');
    const showScriptModalBtn = getEl('show-script-modal-btn'), scriptModal = getEl('script-modal'), scriptModalCloseBtn = getEl('script-modal-close-btn'), scriptInput = getEl('script-input'), generateStoryboardBtn = getEl('generate-storyboard-btn');
    const messageModal = getEl('message-modal'), modalMessage = getEl('modal-message'), modalCloseBtn = getEl('modal-close-btn');
    const imageZoomModal = getEl('image-zoom-modal'), zoomedImage = getEl('zoomed-image'), zoomModalCloseBtn = getEl('zoom-modal-close-btn');
    const exportPdfBtn = getEl('export-pdf-btn'), exportXmlBtn = getEl('export-xml-btn');
    const templateModal = getEl('template-modal'), templateModalTitle = getEl('template-modal-title'), templateInput = getEl('template-input'), templateModalCloseBtn = getEl('template-modal-close-btn'), generateTemplateStoryboardBtn = getEl('generate-template-storyboard-btn');
    const panelCountSlider = getEl('panel-count-slider'), panelCountLabel = getEl('panel-count-label');
    const analyzeStoryBtn = getEl('analyze-story-btn'), analysisModal = getEl('analysis-modal'), analysisContent = getEl('analysis-content'), analysisCloseBtn = getEl('analysis-close-btn');
    const previewAnimaticBtn = getEl('preview-animatic-btn'), animaticModal = getEl('animatic-modal'), animaticImage = getEl('animatic-image'), animaticPlayPauseBtn = getEl('animatic-play-pause-btn'), animaticPrevBtn = getEl('animatic-prev-btn'), animaticNextBtn = getEl('animatic-next-btn'), animaticProgress = getEl('animatic-progress'), animaticCloseBtn = getEl('animatic-close-btn');
    const customStyleContainer = getEl('custom-style-container'), customStyleInput = getEl('custom-style-input');

    // --- State ---
    let panels = [];
    let activePanelId = null;
    let projectLibrary = [];
    let styleImage = { base64: null, mimeType: null };
    let customStyleDescription = "";
    let currentAudio = null;
    let activeTemplate = null;
    let animaticState = { isPlaying: false, currentIndex: 0, timer: null };

    // Style consistency state
    let projectStyleId = null;
    let currentProjectStyle = {
        baseStyle: "Cinematic Realism",
        styleImage: null,
        maintainConsistency: true
    };

    // --- API Helper Functions ---
    async function callBackendApi(endpoint, data = null, method = 'GET') {
        try {
            const config = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
            };

            if (data && method !== 'GET') {
                const payload = JSON.stringify(data);

                // Check payload size before sending
                const payloadSize = new Blob([payload]).size;
                const maxSize = 45 * 1024 * 1024; // 45MB limit

                if (payloadSize > maxSize) {
                    throw new Error(`Request too large (${(payloadSize / 1024 / 1024).toFixed(1)}MB). Please reduce image sizes or number of assets.`);
                }

                console.log(`API request size: ${(payloadSize / 1024).toFixed(1)}KB`);
                config.body = payload;
            }

            const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

            if (!response.ok) {
                let errorMessage = 'API request failed';

                try {
                    const errorData = await response.text();

                    // Handle 413 Request Entity Too Large specifically
                    if (response.status === 413) {
                        errorMessage = 'Request too large. Try reducing image sizes or removing some assets.';
                    } else if (errorData.includes('413 Request Entity Too Large')) {
                        errorMessage = 'Request too large. Try compressing images or removing some assets.';
                    } else if (errorData) {
                        // Try to extract meaningful error message
                        try {
                            const parsed = JSON.parse(errorData);
                            errorMessage = parsed.detail || parsed.message || errorData;
                        } catch {
                            errorMessage = errorData;
                        }
                    }
                } catch {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }

                throw new Error(errorMessage);
            }

            // Handle different response types
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else if (contentType && contentType.includes('audio/')) {
                return await response.blob();
            }

            return await response.text();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // --- Modals ---
    const showMessageModal = (message) => { modalMessage.textContent = message; messageModal.classList.remove('hidden'); };
    modalCloseBtn.onclick = () => messageModal.classList.add('hidden');
    showScriptModalBtn.onclick = () => scriptModal.classList.remove('hidden');
    scriptModalCloseBtn.onclick = () => scriptModal.classList.add('hidden');
    manageLibraryBtn.onclick = () => libraryModal.classList.remove('hidden');
    libraryModalCloseBtn.onclick = () => libraryModal.classList.add('hidden');
    zoomModalCloseBtn.onclick = () => imageZoomModal.classList.add('hidden');
    imageZoomModal.onclick = (e) => { if (e.target === imageZoomModal) imageZoomModal.classList.add('hidden') };
    templateModalCloseBtn.onclick = () => templateModal.classList.add('hidden');
    panelCountSlider.oninput = () => panelCountLabel.textContent = panelCountSlider.value;
    analysisCloseBtn.onclick = () => analysisModal.classList.add('hidden');
    animaticCloseBtn.onclick = () => stopAnimatic();

    // --- Style Consistency Management ---
    function initializeProjectStyle() {
        if (!projectStyleId) {
            projectStyleId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        currentProjectStyle.baseStyle = styleSelector.value === 'Custom' ? customStyleDescription : styleSelector.value;
        currentProjectStyle.styleImage = styleImage.base64 ? styleImage : null;

        // Create style session on backend
        callBackendApi('/create-style-session', {
            projectId: projectStyleId,
            baseStyle: currentProjectStyle.baseStyle,
            styleImage: currentProjectStyle.styleImage
        }, 'POST').catch(error => {
            console.warn('Could not create style session:', error);
        });
    }

    function updateProjectStyle() {
        currentProjectStyle.baseStyle = styleSelector.value === 'Custom' ? customStyleDescription : styleSelector.value;
        currentProjectStyle.styleImage = styleImage.base64 ? styleImage : null;

        // Reinitialize session with new style
        if (projectStyleId) {
            initializeProjectStyle();
        }
    }

    // --- Style Module Enhancements ---
    styleSelector.onchange = () => {
        if (styleSelector.value === 'Custom') {
            customStyleContainer.classList.remove('hidden');
        } else {
            customStyleContainer.classList.add('hidden');
            customStyleDescription = "";
        }
        updateProjectStyle();
    };

    customStyleInput.oninput = (e) => {
        customStyleDescription = e.target.value;
        updateProjectStyle();
    };

    // --- Image Compression Helper ---
    function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions while maintaining aspect ratio
                let { width, height } = img;

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio;
                    height *= ratio;
                }

                canvas.width = width;
                canvas.height = height;

                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(resolve, 'image/jpeg', quality);
            };

            img.src = URL.createObjectURL(file);
        });
    }

    // --- Asset Management ---
    const setupUploader = (inputEl, onFileLoaded) => {
        inputEl.onchange = async (event) => {
            const files = event.target.files;
            if (!files) return;

            for (const file of files) {
                try {
                    // Compress image if it's large
                    let processedFile = file;
                    if (file.size > 2 * 1024 * 1024) { // If larger than 2MB
                        console.log(`Compressing ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
                        processedFile = await compressImage(file);
                        console.log(`Compressed to ${(processedFile.size / 1024 / 1024).toFixed(2)}MB`);
                    }

                    const reader = new FileReader();
                    reader.onload = (e) => onFileLoaded(e.target.result, processedFile.type || file.type, file.name);
                    reader.readAsDataURL(processedFile);
                } catch (error) {
                    console.error('Error processing file:', error);
                    // Fallback to original file
                    const reader = new FileReader();
                    reader.onload = (e) => onFileLoaded(e.target.result, file.type, file.name);
                    reader.readAsDataURL(file);
                }
            }
            inputEl.value = '';
        };
    };

    setupUploader(styleFileInput, async (dataUrl, mimeType) => {
        const [, base64] = dataUrl.split(',');
        Object.assign(styleImage, { base64, mimeType });
        styleRefImg.src = dataUrl;
        styleRefContainer.classList.remove('hidden');

        // Automatically switch to custom style and analyze the image
        styleSelector.value = 'Custom';
        customStyleContainer.classList.remove('hidden');

        // Show loading state
        const originalPlaceholder = customStyleInput.placeholder;
        customStyleInput.placeholder = "Analyzing uploaded image style...";
        customStyleInput.disabled = true;

        try {
            // Analyze the uploaded image style
            const analysisResult = await callBackendApi('/analyze-style', {
                image_base64: base64,
                mime_type: mimeType
            }, 'POST');

            // Update custom style description with AI analysis
            customStyleDescription = analysisResult.style_description || "Custom uploaded style";
            customStyleInput.value = customStyleDescription;

            // Update project style for consistency
            updateProjectStyle();

            showMessageModal(`Style analyzed: ${analysisResult.style_name || 'Custom Style'}`);
        } catch (error) {
            console.error('Style analysis failed:', error);
            customStyleDescription = "Custom uploaded style";
            customStyleInput.value = customStyleDescription;
            updateProjectStyle();
            showMessageModal("Style uploaded successfully. You can edit the description if needed.");
        } finally {
            // Restore input state
            customStyleInput.placeholder = originalPlaceholder;
            customStyleInput.disabled = false;
        }
    });

    uploadStyleBtn.onclick = () => styleFileInput.click();
    removeStyleBtn.onclick = () => {
        Object.assign(styleImage, { base64: null, mimeType: null });
        styleFileInput.value = '';
        styleRefImg.src = '';
        styleRefContainer.classList.add('hidden');

        // Reset custom style if it was active
        if (styleSelector.value === 'Custom') {
            customStyleDescription = "";
            customStyleInput.value = "";
            customStyleContainer.classList.add('hidden');
            styleSelector.value = 'Cinematic Realism';
        }
    };

    // --- Library Logic ---
    function renderLibrary() { renderLibraryModal(); renderLibrarySidebar(); lucide.createIcons(); }

    function renderLibraryModal() {
        libraryModalGrid.innerHTML = '';
        projectLibrary.forEach(asset => {
            const assetEl = document.createElement('div');
            assetEl.className = 'relative group space-y-2';
            assetEl.innerHTML = `<div class="aspect-square w-full bg-gray-900 rounded-md overflow-hidden"><img src="data:${asset.mimeType};base64,${asset.base64}" class="w-full h-full object-cover"></div><input type="text" value="${asset.name}" data-id="${asset.id}" class="library-name-input w-full bg-gray-700 text-white text-sm rounded-md p-1 border-0 focus:ring-2 focus:ring-[var(--primary-color)]"><button data-id="${asset.id}" class="library-delete-btn absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
            libraryModalGrid.appendChild(assetEl);
        });
        libraryModalGrid.querySelectorAll('.library-name-input').forEach(input => {
            input.onchange = (e) => {
                const asset = projectLibrary.find(a => a.id == e.target.dataset.id);
                if (asset) asset.name = e.target.value;
                renderLibrarySidebar();
            };
        });
        libraryModalGrid.querySelectorAll('.library-delete-btn').forEach(btn => {
            btn.onclick = (e) => {
                projectLibrary = projectLibrary.filter(a => a.id != e.currentTarget.dataset.id);
                renderLibrary();
            };
        });
        lucide.createIcons({ nodes: [libraryModalGrid] });
    }

    function renderLibrarySidebar() {
        librarySidebarContainer.innerHTML = '';
        projectLibrary.forEach(asset => {
            const thumbEl = document.createElement('div');
            thumbEl.className = 'aspect-square bg-gray-800 rounded-md overflow-hidden border-2 border-transparent hover:border-indigo-500';
            thumbEl.title = asset.name;
            thumbEl.innerHTML = `<img src="data:${asset.mimeType};base64,${asset.base64}" class="w-full h-full object-cover">`;
            librarySidebarContainer.appendChild(thumbEl);
        });
    }

    setupUploader(libraryFileInput, (dataUrl, mimeType, fileName) => {
        const [, base64] = dataUrl.split(',');
        const assetName = fileName.split('.')[0].replace(/[\s_-]/g, '_');
        projectLibrary.push({ id: Date.now() + Math.random(), name: assetName, base64, mimeType });
        renderLibrary();
    });

    // --- Core Rendering ---
    function render() { renderPanels(); renderInspector(); lucide.createIcons(); }

    // --- Inspector Panel ---
    function handleSuggestionClick(suggestionText) {
        const newPanelData = { prompt: suggestionText, refPrev: true };
        const lowerText = suggestionText.toLowerCase();
        if (lowerText.includes('close-up') || lowerText.includes('portrait')) newPanelData.lens = 'portrait';
        else if (lowerText.includes('wide') || lowerText.includes('establishing')) newPanelData.lens = 'wide';
        if (lowerText.includes('dutch')) newPanelData.composition = 'dutch';
        if (lowerText.includes('golden hour')) newPanelData.lighting = 'golden_hour';
        addNewPanel(newPanelData);
    }

    function renderInspector() {
        const activePanel = panels.find(p => p.id === activePanelId);
        if (!activePanel) { inspectorPanel.classList.add('hidden'); return; }
        inspectorPanel.classList.remove('hidden');

        const createAnnotationInput = (id, label, value, type = 'text', hasPlayButton = false) => `<div class="relative"><label class="block text-sm font-medium text-gray-400" for="inspector-${id}">${label}</label><input type="${type}" id="inspector-${id}" value="${value || ''}" class="mt-1 block w-full rounded-md border-0 bg-gray-800 py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] ${hasPlayButton ? 'pr-10' : ''}" placeholder="...">${hasPlayButton ? `<button id="play-audio-btn" class="absolute right-2 top-7 p-1 text-gray-400 hover:text-white"><i data-lucide="play-circle" class="w-5 h-5"></i></button>` : ''}</div>`;

        const createSelectInput = (id, label, options, selectedValue) => {
            const optionsHTML = Object.entries(options).map(([key, value]) => `<option value="${key}" ${key === selectedValue ? 'selected' : ''}>${value}</option>`).join('');
            return `<div><label class="block text-sm font-medium text-gray-400" for="inspector-${id}">${label}</label><div class="relative mt-1"><select id="inspector-${id}" class="w-full rounded-md border-0 bg-gray-800 py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] appearance-none">${optionsHTML}</select><i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"></i></div></div>`;
        };

        let suggestionsHTML = '';
        if (activePanel.suggestions && activePanel.suggestions.length > 0) {
            const suggestionButtons = activePanel.suggestions.map(s => `<button class="suggestion-btn w-full text-left rounded-md px-3 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors">${s}</button>`).join('');
            suggestionsHTML = `<div class="space-y-4 pt-4 border-t border-gray-800"><h3 class="text-md font-semibold text-white">Next Shot Suggestions</h3><div class="flex flex-col gap-2">${suggestionButtons}</div></div>`;
        }

        const cinematographyOptions = {
            lens: { none: 'Default', wide: 'Wide Angle', portrait: '85mm Portrait', telephoto: 'Telephoto', macro: 'Macro', fisheye: 'Fisheye' },
            lighting: { none: 'Default', cinematic: 'Cinematic', rembrandt: 'Rembrandt', golden_hour: 'Golden Hour', blue_hour: 'Blue Hour', high_key: 'High Key', low_key: 'Low Key' },
            composition: { none: 'Default', centered: 'Centered', thirds: 'Rule of Thirds', dutch: 'Dutch Angle', leading_lines: 'Leading Lines' },
            movement: { none: 'Static', pan_left: 'Pan Left', pan_right: 'Pan Right', dolly_in: 'Dolly In', crane_up: 'Crane Up', handheld: 'Handheld' }
        };

        inspectorPanel.innerHTML = `<h2 class="text-xl font-bold">Panel ${panels.indexOf(activePanel) + 1}</h2><div class="aspect-video w-full rounded-lg bg-cover bg-center border border-gray-700 bg-gray-900 flex items-center justify-center">${activePanel.imageUrl ? `<img src="${activePanel.imageUrl}" class="w-full h-full object-contain rounded-lg">` : `<i data-lucide="image" class="w-16 h-16 text-gray-600"></i>`}</div><div class="space-y-2"><label class="block text-sm font-medium text-gray-300" for="inspector-prompt">AI Prompt</label><textarea id="inspector-prompt" rows="5" class="block w-full rounded-md border-0 bg-gray-800 py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] resize-none" placeholder="e.g., A wide shot of [character_name]...">${activePanel.prompt || ''}</textarea></div><button id="inspector-generate-btn" class="w-full flex items-center justify-center gap-2 rounded-md bg-[var(--primary-color)] px-4 py-3 text-lg font-bold text-white hover:bg-opacity-90 transition-colors"><i data-lucide="sparkles"></i><span>Generate</span></button><div class="flex items-center space-x-2"><input type="checkbox" id="inspector-ref-prev-frame" class="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[var(--primary-color)] focus:ring-[var(--primary-color)]" ${activePanel.refPrev && panels.indexOf(activePanel)>0? 'checked' : ''}><label for="inspector-ref-prev-frame" class="text-sm font-medium">Reference Previous Frame</label></div>${suggestionsHTML}<div class="space-y-4 pt-4 border-t border-gray-800"><h3 class="text-md font-semibold text-white">Cinematography</h3>${createSelectInput('lens', 'Lens / Angle', cinematographyOptions.lens, activePanel.lens)}${createSelectInput('lighting', 'Lighting', cinematographyOptions.lighting, activePanel.lighting)}${createSelectInput('composition', 'Composition', cinematographyOptions.composition, activePanel.composition)}${createSelectInput('movement', 'Camera Movement', cinematographyOptions.movement, activePanel.movement)}</div><div class="space-y-4 pt-4 border-t border-gray-800"><h3 class="text-md font-semibold text-white">Annotations</h3>${createAnnotationInput('duration', 'Duration (s)', activePanel.duration, 'number')}${createAnnotationInput('motion', 'Motion/Transition Notes', activePanel.motion)}${createAnnotationInput('audio', 'Audio/VO Cues', activePanel.audio, 'text', true)}${createAnnotationInput('text', 'On-Screen Text', activePanel.text)}</div>`;

        getEl('inspector-prompt').oninput = (e) => activePanel.prompt = e.target.value;
        getEl('inspector-generate-btn').onclick = generateImage;
        getEl('inspector-ref-prev-frame').onchange = (e) => activePanel.refPrev = e.target.checked;
        getEl('inspector-lens').onchange = (e) => activePanel.lens = e.target.value;
        getEl('inspector-lighting').onchange = (e) => activePanel.lighting = e.target.value;
        getEl('inspector-composition').onchange = (e) => activePanel.composition = e.target.value;
        getEl('inspector-movement').onchange = (e) => activePanel.movement = e.target.value;
        getEl('inspector-duration').oninput = (e) => activePanel.duration = e.target.value;
        getEl('inspector-motion').oninput = (e) => activePanel.motion = e.target.value;
        getEl('inspector-audio').oninput = (e) => activePanel.audio = e.target.value;
        getEl('inspector-text').oninput = (e) => activePanel.text = e.target.value;

        if (getEl('play-audio-btn')) {
            getEl('play-audio-btn').onclick = (e) => generateAndPlayAudio(getEl('inspector-audio').value, e.currentTarget);
        }

        inspectorPanel.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.onclick = () => handleSuggestionClick(btn.textContent);
        });

        lucide.createIcons({ nodes: [inspectorPanel] });
    }

    // --- Panel Canvas ---
    function renderPanels() {
        panelContainer.innerHTML = '';
        panels.forEach((panel, index) => panelContainer.appendChild(createPanelElement(panel, index)));
        const addPanelButton = document.createElement('div');
        addPanelButton.className = "flex items-center justify-center rounded-lg border-2 border-dashed border-gray-700 bg-transparent text-gray-600 hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] transition-colors cursor-pointer min-h-[250px]";
        addPanelButton.innerHTML = `<div class="text-center"><i data-lucide="plus" class="mx-auto h-10 w-10"></i></div>`;
        addPanelButton.onclick = () => addNewPanel();
        panelContainer.appendChild(addPanelButton);
        lucide.createIcons({ nodes: [panelContainer] });
    }

    function createPanelElement(panel, index) {
        const panelEl = document.createElement('div');
        panelEl.className = `rounded-lg bg-[var(--bg-panel)] p-3 border-2 hover:border-[var(--primary-color)] transition-all group cursor-pointer ${panel.id === activePanelId ? 'border-[var(--primary-color)]' : 'border-transparent'}`;
        panelEl.onclick = () => setActivePanel(panel.id);

        const imageContainer = document.createElement('div');
        imageContainer.className = 'relative mb-2 aspect-[16/9] w-full overflow-hidden rounded-md bg-gray-700 flex items-center justify-center';

        if (panel.isLoading) imageContainer.innerHTML = '<div class="loader"></div>';
        else if (panel.imageUrl) imageContainer.innerHTML = `<img src="${panel.imageUrl}" class="h-full w-full object-cover">`;
        else imageContainer.innerHTML = `<i data-lucide="image" class="h-12 w-12 text-gray-500"></i>`;

        if (panel.imageUrl) {
            const overlay = document.createElement('div');
            overlay.className = 'absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4';
            overlay.innerHTML = `<button class="text-white bg-black/50 p-2 rounded-full hover:bg-black/80 zoom-btn"><i data-lucide="zoom-in" class="w-5 h-5"></i></button>`;
            imageContainer.appendChild(overlay);
        }

        const deleteButton = document.createElement('button');
        deleteButton.className = "delete-btn absolute top-2 right-2 text-white bg-black/50 p-1.5 rounded-full hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity";
        deleteButton.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4"></i>`;
        imageContainer.appendChild(deleteButton);

        panelEl.innerHTML = `${imageContainer.outerHTML}<div class="flex items-start justify-between"><p class="text-xs text-gray-400 truncate pr-2">${panel.prompt || 'New Panel'}</p><span class="text-xs font-bold text-gray-500">${String(index + 1).padStart(2, '0')}</span></div>`;

        if (panel.imageUrl) {
            panelEl.querySelector('.zoom-btn').onclick = (e) => {
                e.stopPropagation();
                zoomedImage.src = panel.imageUrl;
                imageZoomModal.classList.remove('hidden');
            };
        }

        panelEl.querySelector('.delete-btn').onclick = (e) => {
            e.stopPropagation();
            deletePanel(panel.id);
        };

        return panelEl;
    }

    // --- Panel Logic ---
    function addNewPanel(panelData = {}) {
        const newPanel = {
            id: Date.now() + Math.random(),
            refPrev: true,
            lens: 'none',
            lighting: 'none',
            composition: 'none',
            movement: 'none',
            duration: 3,
            suggestions: [],
            ...panelData
        };
        panels.push(newPanel);

        // Initialize project style on first panel
        if (panels.length === 1) {
            initializeProjectStyle();
        }

        setActivePanel(newPanel.id);
    }

    function deletePanel(panelId) {
        const index = panels.findIndex(p => p.id === panelId);
        const wasActive = panelId === activePanelId;
        panels = panels.filter(p => p.id !== panelId);

        if (wasActive) {
            const newActiveIndex = Math.max(0, index - 1);
            setActivePanel(panels.length > 0 ? panels[newActiveIndex].id : null);
        } else {
            render();
        }
    }

    function setActivePanel(panelId) { activePanelId = panelId; render(); }

    // --- AI & API Logic ---
    const setBtnLoading = (btn, isLoading, originalContent) => {
        if (!btn) return;
        btn.disabled = isLoading;

        if (isLoading) {
            btn.innerHTML = `<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>`;
        } else {
            btn.innerHTML = originalContent;
            lucide.createIcons({ nodes: [btn] });
        }
    };

    async function generateAndPlayAudio(text, buttonElement) {
        if (!text || !text.trim()) {
            showMessageModal("Please enter some text for the audio cue.");
            return;
        }

        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        const originalButtonContent = buttonElement.innerHTML;
        buttonElement.disabled = true;
        buttonElement.innerHTML = '<div class="mini-loader"></div>';

        try {
            const audioBlob = await callBackendApi('/generate-audio', { text }, 'POST');
            const audioUrl = URL.createObjectURL(audioBlob);
            currentAudio = new Audio(audioUrl);
            currentAudio.play();

            currentAudio.onended = () => {
                buttonElement.innerHTML = originalButtonContent;
                buttonElement.disabled = false;
                lucide.createIcons({ nodes: [buttonElement] });
            };
        } catch (error) {
            showMessageModal(`Audio Generation Error: ${error.message}`);
            buttonElement.innerHTML = originalButtonContent;
            buttonElement.disabled = false;
            lucide.createIcons({ nodes: [buttonElement] });
        }
    }

    async function generateStyleImage() {
        const btn = getEl('generate-style-btn');
        const originalContent = btn.innerHTML;
        setBtnLoading(btn, true, originalContent);

        try {
            // Get effective style (use custom description if Custom is selected)
            let effectiveStyle = styleSelector.value;
            if (styleSelector.value === 'Custom' && customStyleDescription.trim()) {
                effectiveStyle = customStyleDescription.trim();
            } else if (styleSelector.value === 'Custom' && !customStyleDescription.trim()) {
                showMessageModal("Please enter a custom style description first.");
                return;
            }

            const result = await callBackendApi('/generate-style', {
                style: effectiveStyle
            }, 'POST');

            styleImage = {
                base64: result.base64,
                mimeType: result.mimeType
            };
            styleRefImg.src = result.dataUrl;
            styleRefContainer.classList.remove('hidden');
        } catch (error) {
            showMessageModal(`Style Gen Error: ${error.message}`);
        } finally {
            setBtnLoading(btn, false, originalContent);
        }
    }

    async function generateImage() {
        if (!activePanelId) {
            showMessageModal("Select a panel first.");
            return;
        }

        const activePanel = panels.find(p => p.id === activePanelId);
        if (!activePanel.prompt || !activePanel.prompt.trim()) {
            showMessageModal("Please enter a prompt.");
            return;
        }

        activePanel.isLoading = true;
        activePanel.suggestions = [];
        render();

        const btn = getEl('inspector-generate-btn');
        const originalContent = btn.innerHTML;
        setBtnLoading(btn, true, originalContent);

        try {
            // Process asset references in prompt
            const assetRegex = /\[(.*?)\]/g;
            const assetImages = [];
            const matches = [...activePanel.prompt.matchAll(assetRegex)];

            matches.forEach(match => {
                const asset = projectLibrary.find(a => a.name === match[1]);
                if (asset) {
                    assetImages.push({
                        base64: asset.base64,
                        mimeType: asset.mimeType
                    });
                }
            });

            // Get previous panel image URL if referencing
            let previousImageUrl = null;
            if (activePanel.refPrev) {
                const currentIndex = panels.findIndex(p => p.id === activePanelId);
                if (currentIndex > 0 && panels[currentIndex - 1].imageUrl) {
                    previousImageUrl = panels[currentIndex - 1].imageUrl;
                }
            }

            // Get effective style (use custom description if Custom is selected)
            let effectiveStyle = styleSelector.value;
            if (styleSelector.value === 'Custom' && customStyleDescription.trim()) {
                effectiveStyle = customStyleDescription.trim();
            }

            const requestData = {
                prompt: activePanel.prompt,
                style: effectiveStyle,
                cinematography: {
                    lens: activePanel.lens,
                    lighting: activePanel.lighting,
                    composition: activePanel.composition,
                    movement: activePanel.movement
                },
                refPrev: activePanel.refPrev,
                previousImageUrl,
                styleImageBase64: styleImage.base64,
                styleImageMimeType: styleImage.mimeType,
                assetImages,
                // Add style consistency parameters
                projectStyleId: projectStyleId,
                maintainConsistency: currentProjectStyle.maintainConsistency
            };

            // Estimate request size and warn if large
            const estimatedSize = new Blob([JSON.stringify(requestData)]).size;
            if (estimatedSize > 10 * 1024 * 1024) { // Warn if over 10MB
                console.warn(`Large request: ${(estimatedSize / 1024 / 1024).toFixed(1)}MB`);
            }

            const result = await callBackendApi('/generate-image', requestData, 'POST');
            activePanel.imageUrl = result.imageUrl;

            // Generate suggestions
            try {
                const suggestionsResult = await callBackendApi('/generate-suggestions', { prompt: activePanel.prompt }, 'POST');
                activePanel.suggestions = suggestionsResult.suggestions || [];
            } catch (error) {
                console.error('Failed to generate suggestions:', error);
                activePanel.suggestions = [];
            }

        } catch (error) {
            showMessageModal(`Image Gen Error: ${error.message}`);
            activePanel.imageUrl = null;
        } finally {
            activePanel.isLoading = false;
            render();
        }
    }

    async function generateStoryboardFromScript(script, templateType = null, panelCount = 8) {
        const btn = getEl('generate-storyboard-btn') || getEl('generate-template-storyboard-btn');
        const originalContent = btn.innerHTML;
        setBtnLoading(btn, true, originalContent);

        try {
            const result = await callBackendApi('/generate-storyboard', {
                script,
                templateType,
                panelCount
            }, 'POST');

            panels = [];
            result.panels.forEach(panelData => addNewPanel(panelData));

            scriptModal.classList.add('hidden');
            templateModal.classList.add('hidden');

            if (panels.length > 0) setActivePanel(panels[0].id);
            else render();
        } catch (error) {
            showMessageModal(`Storyboard Gen Error: ${error.message}`);
        } finally {
            setBtnLoading(btn, false, originalContent);
        }
    }

    // --- Templates ---
    const templates = {
        explainer: { name: "Explainer Video" },
        social: { name: "Social Media Ad" },
        music: { name: "Music Video" }
    };

    document.querySelectorAll('.template-btn').forEach(btn => {
        btn.onclick = () => {
            activeTemplate = btn.dataset.template;
            templateModalTitle.textContent = `${templates[activeTemplate].name} Architect`;
            templateModal.classList.remove('hidden');
        };
    });

    generateTemplateStoryboardBtn.onclick = () => {
        const context = templateInput.value.trim();
        const panelCount = parseInt(panelCountSlider.value);

        if (!context) {
            showMessageModal("Please provide some context for the template.");
            return;
        }

        generateStoryboardFromScript(context, activeTemplate, panelCount);
    };

    getEl('generate-storyboard-btn').onclick = () => {
        const script = scriptInput.value.trim();

        if (!script) {
            showMessageModal("Please paste a script.");
            return;
        }

        generateStoryboardFromScript(script);
    };

    // --- Exporters ---
    function escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, c => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '\'': '&apos;',
            '"': '&quot;'
        }[c]));
    }

    function exportToXml() {
        if (panels.length === 0) {
            showMessageModal("Cannot export an empty storyboard.");
            return;
        }

        const projectName = getEl('project-title').value;
        const frameRate = 30;
        let sequence = '';
        let totalDuration = 0;

        panels.forEach((panel, index) => {
            const duration = (parseFloat(panel.duration) || 3) * frameRate;
            totalDuration += duration;

            let markers = '';
            if (panel.motion) markers += `<marker><comment>${escapeXml(`Motion: ${panel.motion}`)}</comment></marker>`;
            if (panel.audio) markers += `<marker><comment>${escapeXml(`Audio: ${panel.audio}`)}</comment></marker>`;
            if (panel.text) markers += `<marker><comment>${escapeXml(`On-Screen Text: ${panel.text}`)}</comment></marker>`;
            if (panel.movement && panel.movement !== 'none') markers += `<marker><comment>${escapeXml(`Camera: ${panel.movement.replace(/_/g, ' ')}`)}</comment></marker>`;

            sequence += `<clipitem id="clipitem-${index + 1}"><name>${escapeXml(panel.prompt || `Panel ${index + 1}`)}</name><duration>${duration}</duration><rate><timebase>${frameRate}</timebase></rate><file id="file-${index + 1}"><name>Panel_${String(index + 1).padStart(3, '0')}.jpg</name><pathurl>file://PANEL_${String(index + 1).padStart(3, '0')}.JPG</pathurl></file>${markers}</clipitem>`;
        });

        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE xmeml><xmeml version="4"><sequence><name>${escapeXml(projectName)}</name><duration>${totalDuration}</duration><rate><timebase>${frameRate}</timebase></rate><media><video><track>${sequence}</track></video></media></sequence></xmeml>`;

        const blob = new Blob([xmlContent], { type: 'text/xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${projectName.replace(/ /g, '_')}.xml`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function exportToPdf() {
        showMessageModal("Generating PDF... Please wait.");

        const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: 'a4' });
        const docWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        const imgWidth = docWidth / 2 - margin * 1.5;
        const imgHeight = imgWidth * (9 / 16);

        doc.setFontSize(24);
        doc.text(getEl('project-title').value, docWidth / 2, margin + 10, { align: 'center' });

        for (let i = 0; i < panels.length; i++) {
            const panel = panels[i];
            const isLeft = i % 2 === 0;

            if (i > 0 && isLeft) doc.addPage();

            const x = isLeft ? margin : docWidth / 2 + margin / 2;
            const y = margin * 2;

            doc.setDrawColor(100);
            doc.rect(x, y, imgWidth, imgHeight);
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text(`Panel ${i + 1}`, x, y - 5);

            if (panel.imageUrl) {
                try {
                    doc.addImage(panel.imageUrl, 'JPEG', x, y, imgWidth, imgHeight);
                } catch (e) {
                    console.error(`PDF Export Error: ${e.message}`);
                }
            } else {
                doc.setTextColor(100);
                doc.text("No Image", x + imgWidth / 2, y + imgHeight / 2, { align: 'center' });
            }

            let textY = y + imgHeight + 15;
            doc.setFontSize(8);
            doc.setTextColor(0);

            const addWrappedText = (label, text) => {
                if (!text) return;
                doc.setFont(undefined, 'bold');
                doc.text(label, x, textY);
                doc.setFont(undefined, 'normal');
                const splitText = doc.splitTextToSize(text, imgWidth - 25);
                doc.text(splitText, x + 25, textY);
                textY += (splitText.length * 8) + 5;
            };

            addWrappedText("Prompt:", panel.prompt);
            addWrappedText("Motion:", panel.motion);
            addWrappedText("Audio:", panel.audio);
            addWrappedText("Text:", panel.text);
        }

        doc.save(getEl('project-title').value.replace(/ /g, '_') + '.pdf');
        modalCloseBtn.click();
    }

    // --- Story Analyst ---
    async function analyzeStory() {
        if (panels.length < 3) {
            showMessageModal("Need at least 3 panels to perform a story analysis.");
            return;
        }

        analysisContent.innerHTML = '<div class="w-8 h-8 loader mx-auto mt-10"></div>';
        analysisModal.classList.remove('hidden');

        try {
            const result = await callBackendApi('/analyze-story', { panels }, 'POST');

            const analysisText = result.analysis;
            analysisContent.innerHTML = analysisText
                .replace(/### (.*)/g, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\* ([^*]+)/g, '<li class="ml-4">$1</li>')
                .replace(/(\n)/g, '<br>');
        } catch (error) {
            analysisContent.innerHTML = `<p class="text-red-400">Error analyzing story: ${error.message}</p>`;
        }
    }

    // --- Animatic Player ---
    function playNextAnimaticPanel() {
        animaticState.currentIndex++;
        if (animaticState.currentIndex >= panels.length) {
            animaticState.currentIndex = 0;
        }
        showAnimaticPanel(animaticState.currentIndex);
    }

    function showAnimaticPanel(index) {
        if (index < 0 || index >= panels.length) return;

        animaticState.currentIndex = index;
        const panel = panels[index];
        animaticImage.src = panel.imageUrl || 'https://placehold.co/1920x1080/181824/606060?text=No+Image';

        const totalDuration = panels.reduce((acc, p) => acc + (parseFloat(p.duration) || 3) * 1000, 0);
        const elapsed = panels.slice(0, index).reduce((acc, p) => acc + (parseFloat(p.duration) || 3) * 1000, 0);
        animaticProgress.style.width = `${(elapsed / totalDuration) * 100}%`;

        if (animaticState.isPlaying) {
            animaticState.timer = setTimeout(playNextAnimaticPanel, (parseFloat(panel.duration) || 3) * 1000);
        }
    }

    function toggleAnimaticPlay() {
        animaticState.isPlaying = !animaticState.isPlaying;
        animaticPlayPauseBtn.innerHTML = animaticState.isPlaying ? `<i data-lucide="pause"></i>` : `<i data-lucide="play"></i>`;
        lucide.createIcons({ nodes: [animaticPlayPauseBtn] });

        if (animaticState.isPlaying) {
            showAnimaticPanel(animaticState.currentIndex);
        } else {
            if (animaticState.timer) clearTimeout(animaticState.timer);
        }
    }

    function stopAnimatic() {
        if (animaticState.timer) clearTimeout(animaticState.timer);
        animaticState.isPlaying = false;
        animaticState.currentIndex = 0;
        animaticModal.classList.add('hidden');
    }

    previewAnimaticBtn.onclick = () => {
        if (panels.filter(p => p.imageUrl).length === 0) {
            showMessageModal("Please generate at least one image to preview the animatic.");
            return;
        }
        animaticModal.classList.remove('hidden');
        toggleAnimaticPlay();
    };

    animaticPlayPauseBtn.onclick = toggleAnimaticPlay;
    animaticNextBtn.onclick = () => {
        if (animaticState.timer) clearTimeout(animaticState.timer);
        playNextAnimaticPanel();
    };
    animaticPrevBtn.onclick = () => {
        if (animaticState.timer) clearTimeout(animaticState.timer);
        animaticState.currentIndex = (animaticState.currentIndex - 2 + panels.length) % panels.length;
        playNextAnimaticPanel();
    };

    // --- Event Listeners & Initial Load ---
    generateStyleBtn.onclick = generateStyleImage;
    exportPdfBtn.onclick = exportToPdf;
    exportXmlBtn.onclick = exportToXml;
    analyzeStoryBtn.onclick = analyzeStory;


    addNewPanel({ prompt: "A wide, establishing shot of a futuristic city at sunset." });
});