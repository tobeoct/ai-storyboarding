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
    // Enhanced library elements
    const libraryAssetTypeSelect = getEl('library-asset-type'), libraryAssetNameInput = getEl('library-asset-name');
    const styleSelector = getEl('style-selector'), customStyleContainer = getEl('custom-style-container'), customStyleInput = getEl('custom-style-input'), styleFileInput = getEl('style-file-input'), uploadStyleBtn = getEl('upload-style-btn'), styleRefContainer = getEl('style-ref-container'), styleRefImg = getEl('style-ref-img');
    const showScriptModalBtn = getEl('show-script-modal-btn'), scriptModal = getEl('script-modal'), scriptModalCloseBtn = getEl('script-modal-close-btn'), scriptInput = getEl('script-input'), generateStoryboardBtn = getEl('generate-storyboard-btn');
    const messageModal = getEl('message-modal'), modalMessage = getEl('modal-message'), modalCloseBtn = getEl('modal-close-btn');
    const imageZoomModal = getEl('image-zoom-modal'), zoomedImage = getEl('zoomed-image'), zoomModalCloseBtn = getEl('zoom-modal-close-btn');
    const exportPdfBtn = getEl('export-pdf-btn'), exportXmlBtn = getEl('export-xml-btn');
    const templateModal = getEl('template-modal'), templateModalTitle = getEl('template-modal-title'), templateInput = getEl('template-input'), templateModalCloseBtn = getEl('template-modal-close-btn'), generateTemplateStoryboardBtn = getEl('generate-template-storyboard-btn');
    const panelCountSlider = getEl('panel-count-slider'), panelCountLabel = getEl('panel-count-label');
    const analyzeStoryBtn = getEl('analyze-story-btn'), analysisModal = getEl('analysis-modal'), analysisContent = getEl('analysis-content'), analysisCloseBtn = getEl('analysis-close-btn');
    const previewAnimaticBtn = getEl('preview-animatic-btn'), animaticModal = getEl('animatic-modal'), animaticImage = getEl('animatic-image'), animaticPlayPauseBtn = getEl('animatic-play-pause-btn'), animaticPrevBtn = getEl('animatic-prev-btn'), animaticNextBtn = getEl('animatic-next-btn'), animaticProgress = getEl('animatic-progress'), animaticCloseBtn = getEl('animatic-close-btn');
    // Removed duplicate customStyleContainer/customStyleInput references (now in line 15)
    const styleAnalysisModal = getEl('style-analysis-modal'), styleAnalysisContent = getEl('style-analysis-content'), styleAnalysisCloseBtn = getEl('style-analysis-close-btn');
    // Script modal elements will be retrieved dynamically when modal opens
    // View script modal elements (these exist on page load)
    const viewScriptBtn = getEl('view-script-btn'), scriptViewerModal = getEl('script-viewer-modal'), scriptViewerContent = getEl('script-viewer-content'), scriptViewerCloseBtn = getEl('script-viewer-close-btn');

    // --- State ---
    let panels = [];
    let activePanelId = null;
    let projectLibrary = []; // Legacy support - will migrate to projectAssets

    // Enhanced library for characters and scenes (Whisk-style)
    let projectAssets = {
        characters: [], // Named characters with consistent appearance
        scenes: [],     // Background/environment assets
        props: []       // Objects and items
    };

    let styleImage = { base64: null, mimeType: null };
    let currentAudio = null;
    let activeTemplate = null;
    let animaticState = { isPlaying: false, currentIndex: 0, timer: null };
    let currentScript = null;
    let currentLibraryTab = 'characters';

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
    showScriptModalBtn.onclick = () => {
        scriptModal.classList.remove('hidden');
        // Set up event handlers when modal opens to ensure elements are available
        setupScriptModalHandlers();
    };
    scriptModalCloseBtn.onclick = () => scriptModal.classList.add('hidden');
    manageLibraryBtn.onclick = () => {
        libraryModal.classList.remove('hidden');
        renderLibrary();
    };
    libraryModalCloseBtn.onclick = () => libraryModal.classList.add('hidden');

    // Library tab event handlers
    getEl('library-tab-characters').onclick = () => switchLibraryTab('characters');
    getEl('library-tab-scenes').onclick = () => switchLibraryTab('scenes');
    getEl('library-tab-props').onclick = () => switchLibraryTab('props');
    getEl('library-tab-legacy').onclick = () => switchLibraryTab('legacy');
    zoomModalCloseBtn.onclick = () => imageZoomModal.classList.add('hidden');
    imageZoomModal.onclick = (e) => { if (e.target === imageZoomModal) imageZoomModal.classList.add('hidden') };
    templateModalCloseBtn.onclick = () => templateModal.classList.add('hidden');
    panelCountSlider.oninput = () => panelCountLabel.textContent = panelCountSlider.value;
    analysisCloseBtn.onclick = () => analysisModal.classList.add('hidden');
    animaticCloseBtn.onclick = () => stopAnimatic();
    styleAnalysisCloseBtn.onclick = () => closeStyleAnalysisModal();
    if (scriptViewerCloseBtn) scriptViewerCloseBtn.onclick = () => scriptViewerModal.classList.add('hidden');
    if (viewScriptBtn) {
        viewScriptBtn.onclick = () => {
            console.log('View script button clicked');
            showScriptViewer();
        };
    } else {
        console.error('viewScriptBtn element not found during initialization');
    }

    // --- Style Consistency Management ---
    function initializeProjectStyle() {
        if (!projectStyleId) {
            projectStyleId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        currentProjectStyle.baseStyle = styleSelector.value === 'Custom' ? customStyleInput.value.trim() : styleSelector.value;
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
        currentProjectStyle.baseStyle = styleSelector.value === 'Custom' ? customStyleInput.value.trim() : styleSelector.value;
        currentProjectStyle.styleImage = styleImage.base64 ? styleImage : null;

        // Reinitialize session with new style
        if (projectStyleId) {
            initializeProjectStyle();
        }
    }

    // --- Style Analysis Modal Functions ---
    function showStyleAnalysisModal(analysisResult) {
        // Populate modal content with better formatting
        styleAnalysisContent.innerHTML = `
            <div class="space-y-4">
                <div class="bg-[var(--bg-panel)] rounded-lg p-3 border border-[var(--border-color)]">
                    <h4 class="font-semibold text-[var(--text-primary)] text-base mb-2">${analysisResult.style_name || 'Custom Style'}</h4>
                    <p class="text-xs text-[var(--text-secondary)] leading-relaxed">${analysisResult.style_description || 'Custom uploaded style'}</p>
                </div>

                ${analysisResult.characteristics ? `
                <div class="bg-[var(--bg-panel)] rounded-lg p-3 border border-[var(--border-color)]">
                    <h5 class="font-medium text-[var(--text-primary)] text-sm mb-3">Style Characteristics</h5>
                    <div class="space-y-2">
                        ${Object.entries(analysisResult.characteristics).map(([key, value]) =>
                            `<div class="flex justify-between items-center py-1 border-b border-gray-200 last:border-b-0">
                                <span class="text-xs font-medium capitalize text-[var(--text-primary)]">${key.replace('_', ' ')}</span>
                                <span class="text-xs text-[var(--text-secondary)] text-right max-w-32 truncate" title="${value}">${value}</span>
                            </div>`
                        ).join('')}
                    </div>
                </div>` : ''}

                <div class="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div class="flex items-center">
                        <i data-lucide="check-circle" class="w-4 h-4 text-green-600 mr-2"></i>
                        <p class="text-xs text-green-800 font-medium">Style applied successfully!</p>
                    </div>
                    <p class="text-xs text-green-700 mt-1">This style will be used for all future panel generations.</p>
                </div>
            </div>
        `;

        // Recreate icons
        lucide.createIcons({ nodes: [styleAnalysisContent] });

        // Show modal with animation
        styleAnalysisModal.classList.remove('hidden');
        setTimeout(() => {
            styleAnalysisModal.classList.remove('translate-x-full');
        }, 10);
    }

    function closeStyleAnalysisModal() {
        styleAnalysisModal.classList.add('translate-x-full');
        setTimeout(() => {
            styleAnalysisModal.classList.add('hidden');
        }, 300);
    }

    // --- Script Management Functions ---
    function debugScriptElements() {
        // Get fresh element references for debugging
        const elements = {
            naturalInput: getEl('natural-input'),
            scriptOutput: getEl('script-output'),
            refineScriptBtn: getEl('refine-script-btn'),
            clearInputBtn: getEl('clear-input-btn'),
            naturalModeBtn: getEl('natural-mode-btn'),
            scriptModeBtn: getEl('script-mode-btn'),
            naturalInputSection: getEl('natural-input-section'),
            scriptInputSection: getEl('script-input-section'),
            generateStoryboardFromOutputBtn: getEl('generate-storyboard-from-output-btn'),
            copyScriptBtn: getEl('copy-script-btn'),
            viewScriptBtn: getEl('view-script-btn'),
            scriptViewerModal: getEl('script-viewer-modal'),
            scriptViewerContent: getEl('script-viewer-content'),
            scriptViewerCloseBtn: getEl('script-viewer-close-btn'),
            editScriptBtn: getEl('edit-script-btn'),
            copyCurrentScriptBtn: getEl('copy-current-script-btn')
        };

        console.log('Script Elements Debug:', elements);

        Object.entries(elements).forEach(([name, element]) => {
            if (!element) {
                console.error(`Missing element: ${name}`);
            }
        });
    }

    function showScriptViewer() {
        console.log('showScriptViewer called, currentScript:', currentScript ? 'exists' : 'null');

        // Get fresh element references
        const viewerModal = getEl('script-viewer-modal');
        const viewerContent = getEl('script-viewer-content');

        if (!viewerModal) {
            console.error('script-viewer-modal element not found');
            return;
        }

        if (!viewerContent) {
            console.error('script-viewer-content element not found');
            return;
        }

        // Show loading state briefly
        viewerContent.innerHTML = '<div class="flex items-center justify-center mt-8"><div class="loader"></div></div>';
        viewerModal.classList.remove('hidden');

        // Set up viewer modal handlers
        const closeBtn = getEl('script-viewer-close-btn');
        const editBtn = getEl('edit-script-btn');
        const copyBtn = getEl('copy-current-script-btn');

        if (closeBtn) {
            closeBtn.onclick = () => viewerModal.classList.add('hidden');
        }

        if (editBtn) {
            editBtn.onclick = () => {
                viewerModal.classList.add('hidden');
                const scriptMod = getEl('script-modal');
                if (scriptMod) {
                    scriptMod.classList.remove('hidden');
                    setupScriptModalHandlers();
                    if (currentScript) {
                        switchToScriptMode();
                        const scriptInp = getEl('script-input');
                        if (scriptInp) scriptInp.value = currentScript;
                    }
                }
            };
        }

        if (copyBtn) {
            copyBtn.onclick = () => {
                if (currentScript) {
                    copyToClipboard(currentScript);
                }
            };
        }

        // Simulate brief loading to show feedback, then show content
        setTimeout(() => {
            if (currentScript) {
                viewerContent.textContent = currentScript;
            } else {
                viewerContent.innerHTML = '<div class="text-gray-500 italic text-center mt-8">No script available. Create a script to view it here.</div>';
            }
        }, 200);
    }

    function switchToNaturalMode() {
        const naturalBtn = getEl('natural-mode-btn');
        const scriptBtn = getEl('script-mode-btn');
        const naturalSec = getEl('natural-input-section');
        const scriptSec = getEl('script-input-section');

        if (naturalBtn) {
            naturalBtn.classList.add('bg-[var(--primary-color)]', 'text-white');
            naturalBtn.classList.remove('text-gray-400');
        }
        if (scriptBtn) {
            scriptBtn.classList.remove('bg-[var(--primary-color)]', 'text-white');
            scriptBtn.classList.add('text-gray-400');
        }
        if (naturalSec) naturalSec.classList.remove('hidden');
        if (scriptSec) scriptSec.classList.add('hidden');
    }

    function switchToScriptMode() {
        const naturalBtn = getEl('natural-mode-btn');
        const scriptBtn = getEl('script-mode-btn');
        const naturalSec = getEl('natural-input-section');
        const scriptSec = getEl('script-input-section');

        if (scriptBtn) {
            scriptBtn.classList.add('bg-[var(--primary-color)]', 'text-white');
            scriptBtn.classList.remove('text-gray-400');
        }
        if (naturalBtn) {
            naturalBtn.classList.remove('bg-[var(--primary-color)]', 'text-white');
            naturalBtn.classList.add('text-gray-400');
        }
        if (scriptSec) scriptSec.classList.remove('hidden');
        if (naturalSec) naturalSec.classList.add('hidden');
    }

    async function refineNaturalLanguageToScript() {
        console.log('refineNaturalLanguageToScript called');

        // Get fresh element references
        const naturalInp = getEl('natural-input');
        const scriptOut = getEl('script-output');
        const refineBtn = getEl('refine-script-btn');
        const generateBtn = getEl('generate-storyboard-from-output-btn');
        const copyBtn = getEl('copy-script-btn');

        if (!naturalInp) {
            console.error('natural-input element not found');
            return;
        }

        const naturalText = naturalInp.value.trim();
        console.log('Natural text:', naturalText);

        if (!naturalText) {
            showMessageModal("Please enter a story description first.");
            return;
        }

        if (!refineBtn) {
            console.error('refine-script-btn element not found');
            return;
        }

        const originalContent = refineBtn.innerHTML;

        // Set loading state with spinner
        refineBtn.disabled = true;
        refineBtn.innerHTML = '<div class="mini-loader"></div><span>Refining...</span>';
        refineBtn.classList.add('cursor-not-allowed', 'opacity-75');

        try {
            console.log('Calling backend API...');
            const result = await callBackendApi('/refine-script', {
                natural_language: naturalText
            }, 'POST');

            console.log('API response:', result);

            if (result.refined_script) {
                if (scriptOut) scriptOut.textContent = result.refined_script;
                currentScript = result.refined_script;

                // Enable buttons
                if (generateBtn) generateBtn.disabled = false;
                if (copyBtn) copyBtn.disabled = false;

                showMessageModal("Script refined successfully!");
            } else {
                throw new Error("No refined script received from server");
            }

        } catch (error) {
            console.error('Script refinement error:', error);
            showMessageModal(`Script refinement failed: ${error.message}`);
        } finally {
            // Restore button state
            refineBtn.disabled = false;
            refineBtn.innerHTML = originalContent;
            refineBtn.classList.remove('cursor-not-allowed', 'opacity-75');
            lucide.createIcons({ nodes: [refineBtn] });
        }
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showMessageModal("Copied to clipboard!");
        }).catch(() => {
            showMessageModal("Failed to copy to clipboard.");
        });
    }

    function setupScriptModalHandlers() {
        console.log('Setting up script modal handlers...');

        // Get fresh references to elements
        const refineBtn = getEl('refine-script-btn');
        const clearBtn = getEl('clear-input-btn');
        const naturalBtn = getEl('natural-mode-btn');
        const scriptBtn = getEl('script-mode-btn');
        const copyBtn = getEl('copy-script-btn');
        const generateBtn = getEl('generate-storyboard-from-output-btn');
        const naturalInp = getEl('natural-input');
        const scriptOut = getEl('script-output');
        const naturalSec = getEl('natural-input-section');
        const scriptSec = getEl('script-input-section');

        // Set up handlers with fresh element references
        if (refineBtn) {
            refineBtn.onclick = (e) => {
                e.preventDefault();
                console.log('Refine button clicked');
                refineNaturalLanguageToScript();
            };
            console.log('Refine button handler set');
        } else {
            console.error('refine-script-btn not found');
        }

        if (clearBtn) {
            clearBtn.onclick = (e) => {
                e.preventDefault();
                if (naturalInp) naturalInp.value = '';
                if (scriptOut) scriptOut.innerHTML = '<div class="text-gray-500 italic text-center mt-8">Your refined script will appear here...</div>';
                if (generateBtn) generateBtn.disabled = true;
                if (copyBtn) copyBtn.disabled = true;
            };
            console.log('Clear button handler set');
        }

        if (naturalBtn) {
            naturalBtn.onclick = (e) => {
                e.preventDefault();
                switchToNaturalMode();
            };
        }

        if (scriptBtn) {
            scriptBtn.onclick = (e) => {
                e.preventDefault();
                switchToScriptMode();
            };
        }

        if (copyBtn) {
            copyBtn.onclick = (e) => {
                e.preventDefault();
                if (scriptOut) copyToClipboard(scriptOut.textContent);
            };
        }

        if (generateBtn) {
            generateBtn.onclick = (e) => {
                e.preventDefault();
                if (currentScript) {
                    const originalContent = generateBtn.innerHTML;
                    setBtnLoading(generateBtn, true, originalContent);

                    generateStoryboardFromScript(currentScript, null, 8, generateBtn).catch((error) => {
                        console.error('Generate from output failed:', error);
                    }).finally(() => {
                        setBtnLoading(generateBtn, false, originalContent);
                    });
                }
            };
        }

        // Make sure Lucide icons are created for the modal
        lucide.createIcons();
    }

    // --- Style Module Enhancements ---
    styleSelector.onchange = () => {
        if (styleSelector.value === 'Custom') {
            customStyleContainer.classList.remove('hidden');
        } else {
            customStyleContainer.classList.add('hidden');
        }
        updateProjectStyle();
    };

    customStyleInput.oninput = (e) => {
        updateProjectStyle();
    };

    // Initialize style on load
    customStyleInput.onchange = (e) => {
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

    // Style upload functionality
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
        const originalUploadBtnContent = uploadStyleBtn.innerHTML;

        customStyleInput.placeholder = "Analyzing uploaded image style...";
        customStyleInput.disabled = true;
        uploadStyleBtn.disabled = true;
        uploadStyleBtn.innerHTML = '<div class="mini-loader"></div><span>Analyzing...</span>';
        uploadStyleBtn.classList.add('cursor-not-allowed', 'opacity-75');

        try {
            // Analyze the uploaded image style
            const analysisResult = await callBackendApi('/analyze-style', {
                image_base64: base64,
                mime_type: mimeType
            }, 'POST');

            // Update custom style description with AI analysis
            customStyleInput.value = analysisResult.style_description || "Custom uploaded style";

            // Update project style for consistency
            updateProjectStyle();

            console.log('Style analysis result:', analysisResult);

            // Show detailed analysis in side modal instead of simple message
            showStyleAnalysisModal(analysisResult);

        } catch (error) {
            console.error('Style analysis failed:', error);
            customStyleInput.value = "Custom uploaded style";
            updateProjectStyle();
            showMessageModal("Style uploaded successfully. You can edit the description if needed.");
        } finally {
            // Restore input and button state
            customStyleInput.placeholder = originalPlaceholder;
            customStyleInput.disabled = false;
            uploadStyleBtn.disabled = false;
            uploadStyleBtn.innerHTML = originalUploadBtnContent;
            uploadStyleBtn.classList.remove('cursor-not-allowed', 'opacity-75');
            lucide.createIcons({ nodes: [uploadStyleBtn] });
        }
    });

    // Style generation functionality
    uploadStyleBtn.onclick = async () => {
        if (styleSelector.value === 'Custom' && customStyleInput.value.trim()) {
            await generateStyleImage(customStyleInput.value.trim());
        } else {
            showMessageModal('Please select "Custom Style" and enter a style description first.');
        }
    };

    // --- Library Logic ---
    // --- Enhanced Library System (Whisk-style) ---

    function renderLibrary() {
        renderLibraryModal();
        renderLibrarySidebar();
        lucide.createIcons();
    }

    function switchLibraryTab(tabName) {
        currentLibraryTab = tabName;

        // Update tab buttons
        document.querySelectorAll('[id^="library-tab-"]').forEach(btn => {
            btn.classList.remove('bg-[var(--primary-color)]', 'text-white');
            btn.classList.add('text-gray-400');
        });
        getEl(`library-tab-${tabName}`).classList.add('bg-[var(--primary-color)]', 'text-white');
        getEl(`library-tab-${tabName}`).classList.remove('text-gray-400');

        // Update content visibility
        document.querySelectorAll('.library-category-content').forEach(content => {
            content.classList.add('hidden');
        });
        getEl(`library-content-${tabName}`).classList.remove('hidden');

        // Update add asset type selector
        getEl('library-asset-type').value = tabName === 'legacy' ? 'characters' : tabName;
    }

    function renderLibraryModal() {
        // Render legacy assets
        const legacyGrid = getEl('library-grid-legacy');
        if (legacyGrid) {
            legacyGrid.innerHTML = '';
            projectLibrary.forEach(asset => {
                const assetEl = document.createElement('div');
                assetEl.className = 'relative group space-y-2';
                assetEl.innerHTML = `
                    <div class="aspect-square w-full bg-gray-900 rounded-md overflow-hidden">
                        <img src="data:${asset.mimeType};base64,${asset.base64}" class="w-full h-full object-cover">
                    </div>
                    <input type="text" value="${asset.name}" data-id="${asset.id}" data-type="legacy"
                           class="library-name-input w-full bg-gray-700 text-white text-sm rounded-md p-1 border-0 focus:ring-2 focus:ring-[var(--primary-color)]">
                    <button data-id="${asset.id}" data-type="legacy" class="library-delete-btn absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>`;
                legacyGrid.appendChild(assetEl);
            });
        }

        // Render categorized assets
        Object.entries(projectAssets).forEach(([category, assets]) => {
            const grid = getEl(`library-grid-${category}`);
            if (!grid) return;

            grid.innerHTML = '';
            assets.forEach(asset => {
                const assetEl = document.createElement('div');
                assetEl.className = 'relative group space-y-2';

                const categoryIcon = {
                    characters: 'user',
                    scenes: 'image',
                    props: 'package',
                    styles: 'palette'
                }[category];

                const tagColor = {
                    characters: 'bg-blue-600',
                    scenes: 'bg-green-600',
                    props: 'bg-purple-600',
                    styles: 'bg-orange-600'
                }[category];

                assetEl.innerHTML = `
                    <div class="aspect-square w-full bg-gray-900 rounded-md overflow-hidden relative">
                        <img src="data:${asset.mimeType};base64,${asset.base64}" class="w-full h-full object-cover">
                        <div class="absolute top-2 left-2 ${tagColor} text-white px-2 py-1 rounded text-xs font-medium">
                            <i data-lucide="${categoryIcon}" class="w-3 h-3 inline mr-1"></i>${category.slice(0, -1)}
                        </div>
                        ${asset.isConsistent ? '<div class="absolute top-2 right-2 bg-green-600 text-white px-2 py-1 rounded text-xs"><i data-lucide="check" class="w-3 h-3"></i></div>' : ''}
                    </div>
                    <input type="text" value="${asset.name}" data-id="${asset.id}" data-type="${category}"
                           class="library-name-input w-full bg-gray-700 text-white text-sm rounded-md p-1 border-0 focus:ring-2 focus:ring-[var(--primary-color)]">
                    ${asset.description ? `<p class="text-xs text-gray-400 truncate" title="${asset.description}">${asset.description}</p>` : ''}
                    <button data-id="${asset.id}" data-type="${category}" class="library-delete-btn absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>`;
                grid.appendChild(assetEl);
            });
        });

        // Setup event handlers
        document.querySelectorAll('.library-name-input').forEach(input => {
            input.onchange = (e) => {
                const { id, type } = e.target.dataset;
                if (type === 'legacy') {
                    const asset = projectLibrary.find(a => a.id == id);
                    if (asset) asset.name = e.target.value;
                } else {
                    const asset = projectAssets[type].find(a => a.id == id);
                    if (asset) asset.name = e.target.value;
                }
                renderLibrarySidebar();
            };
        });

        document.querySelectorAll('.library-delete-btn').forEach(btn => {
            btn.onclick = (e) => {
                const { id, type } = e.currentTarget.dataset;
                if (type === 'legacy') {
                    projectLibrary = projectLibrary.filter(a => a.id != id);
                } else {
                    projectAssets[type] = projectAssets[type].filter(a => a.id != id);
                }
                renderLibrary();
            };
        });

        lucide.createIcons();
    }

    function renderLibrarySidebar() {
        librarySidebarContainer.innerHTML = '';

        // Render all assets in sidebar with category indicators
        const allAssets = [
            ...projectLibrary.map(a => ({...a, category: 'legacy'})),
            ...Object.entries(projectAssets).flatMap(([category, assets]) =>
                assets.map(a => ({...a, category}))
            )
        ];

        allAssets.forEach(asset => {
            const thumbEl = document.createElement('div');
            thumbEl.className = 'aspect-square bg-gray-800 rounded-md overflow-hidden border-2 border-transparent hover:border-indigo-500 relative group';
            thumbEl.title = `${asset.name} (${asset.category})`;

            const categoryIcon = {
                legacy: 'archive',
                characters: 'user',
                scenes: 'image',
                props: 'package',
                styles: 'palette'
            }[asset.category];

            thumbEl.innerHTML = `
                <img src="data:${asset.mimeType};base64,${asset.base64}" class="w-full h-full object-cover">
                <div class="absolute bottom-1 right-1 bg-black/50 text-white p-1 rounded">
                    <i data-lucide="${categoryIcon}" class="w-3 h-3"></i>
                </div>`;
            librarySidebarContainer.appendChild(thumbEl);
        });

        lucide.createIcons({ nodes: [librarySidebarContainer] });
    }

    // Enhanced uploader for categorized assets
    setupUploader(libraryFileInput, (dataUrl, mimeType, fileName) => {
        const [, base64] = dataUrl.split(',');
        const assetType = libraryAssetTypeSelect.value;
        const customName = libraryAssetNameInput.value.trim();
        const assetName = customName || fileName.split('.')[0].replace(/[\s_-]/g, '_');

        const newAsset = {
            id: Date.now() + Math.random(),
            name: assetName,
            base64,
            mimeType,
            dateAdded: new Date().toISOString(),
            isConsistent: false // Will be marked true when used in generation
        };

        // Add description for characters and scenes
        if (assetType === 'characters') {
            newAsset.description = 'Character appearance reference';
        } else if (assetType === 'scenes') {
            newAsset.description = 'Scene/location reference';
        }

        projectAssets[assetType].push(newAsset);
        libraryAssetNameInput.value = ''; // Clear name input
        renderLibrary();
        switchLibraryTab(assetType); // Switch to the added category
    });

    // Character and scene detection functions
    function detectCharacterReferences(text) {
        const characterPatterns = [
            /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:says?|walks?|runs?|stands?|sits?|looks?|smiles?|frowns?)/gi,
            /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+/gi,
            /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:has|wears?)\s+/gi
        ];

        const detectedCharacters = new Set();
        characterPatterns.forEach(pattern => {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                const name = match[1].trim();
                if (name.length > 1 && !['The', 'A', 'An', 'This', 'That', 'There', 'Here'].includes(name)) {
                    detectedCharacters.add(name);
                }
            }
        });

        return Array.from(detectedCharacters);
    }

    function detectSceneReferences(text) {
        const scenePatterns = [
            /\b(?:at|in|inside|outside|near)\s+(?:the\s+)?([a-z\s]+?)(?:\s*[,.;]|\s+(?:where|with|and))/gi,
            /\b(?:INT\.|EXT\.)\s+([A-Z\s]+?)(?:\s*-|\s*$)/gi,
            /\blocation:\s*([^,.\n]+)/gi
        ];

        const detectedScenes = new Set();
        scenePatterns.forEach(pattern => {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                const scene = match[1].trim().toLowerCase();
                if (scene.length > 2) {
                    detectedScenes.add(scene);
                }
            }
        });

        return Array.from(detectedScenes);
    }

    function findMatchingAssets(detectedItems, category) {
        return projectAssets[category].filter(asset => {
            const assetName = asset.name.toLowerCase();
            const assetDescription = (asset.description || '').toLowerCase();

            return detectedItems.some(item => {
                const itemLower = item.toLowerCase();
                return assetName.includes(itemLower) ||
                       itemLower.includes(assetName) ||
                       assetDescription.includes(itemLower);
            });
        });
    }

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

        // Build available assets helper
        const allAssets = [
            ...projectLibrary.map(a => ({...a, category: 'legacy'})),
            ...Object.entries(projectAssets).flatMap(([category, assets]) =>
                assets.map(a => ({...a, category}))
            )
        ];

        let assetHelperHTML = '';
        if (allAssets.length > 0) {
            const assetsByCategory = {};
            allAssets.forEach(asset => {
                if (!assetsByCategory[asset.category]) assetsByCategory[asset.category] = [];
                assetsByCategory[asset.category].push(asset);
            });

            const assetButtons = Object.entries(assetsByCategory).map(([category, assets]) => {
                const categoryIcon = {
                    legacy: 'archive',
                    characters: 'user',
                    scenes: 'image',
                    props: 'package',
                    styles: 'palette'
                }[category];

                const assetTags = assets.map(asset =>
                    `<button class="asset-ref-btn inline-flex items-center px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer transition-colors" data-name="${asset.name}">
                        <i data-lucide="${categoryIcon}" class="w-3 h-3 mr-1"></i>[${asset.name}]
                    </button>`
                ).join(' ');

                return `<div class="mb-2">
                    <h4 class="text-xs font-medium text-gray-400 mb-1 capitalize">${category}</h4>
                    <div class="flex flex-wrap gap-1">${assetTags}</div>
                </div>`;
            }).join('');

            assetHelperHTML = `<div class="space-y-2 pt-2 border-t border-gray-700">
                <div class="flex items-center gap-2">
                    <h3 class="text-sm font-medium text-gray-300">Available Assets</h3>
                    <span class="text-xs text-gray-500">Click to insert</span>
                </div>
                <div class="max-h-24 overflow-y-auto pr-1">
                    ${assetButtons}
                </div>
            </div>`;
        }

        inspectorPanel.innerHTML = `<h2 class="text-xl font-bold">Panel ${panels.indexOf(activePanel) + 1}</h2><div class="aspect-video w-full rounded-lg bg-cover bg-center border border-gray-700 bg-gray-900 flex items-center justify-center">${activePanel.imageUrl ? `<img src="${activePanel.imageUrl}" class="w-full h-full object-contain rounded-lg">` : `<i data-lucide="image" class="w-16 h-16 text-gray-600"></i>`}</div><div class="space-y-2"><label class="block text-sm font-medium" for="inspector-prompt">AI Prompt</label><textarea id="inspector-prompt" rows="5" class="block w-full rounded-md border-0 bg-gray-800 py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] resize-none" placeholder="e.g., A wide shot of [character_name]...">${activePanel.prompt || ''}</textarea>${assetHelperHTML}</div><button id="inspector-generate-btn" class="w-full flex items-center justify-center gap-2 rounded-md bg-[var(--primary-color)] px-4 py-3 text-lg font-bold text-white hover:bg-opacity-90 transition-colors"><i data-lucide="sparkles"></i><span>Generate</span></button><div class="flex items-center space-x-2"><input type="checkbox" id="inspector-ref-prev-frame" class="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[var(--primary-color)] focus:ring-[var(--primary-color)]" ${(activePanel.refPrev || panels.indexOf(activePanel) > 0) ? 'checked' : ''}><label for="inspector-ref-prev-frame" class="text-sm font-medium">Reference Previous Frame</label></div>${suggestionsHTML}<div class="space-y-4 pt-4 border-t border-gray-800"><h3 class="text-md font-semibold">Annotations</h3>${createAnnotationInput('duration', 'Duration (s)', activePanel.duration, 'number')}${createAnnotationInput('motion', 'Motion/Transition Notes', activePanel.motion)}${createAnnotationInput('audio', 'Audio/VO Cues', activePanel.audio, 'text', true)}${createAnnotationInput('text', 'On-Screen Text', activePanel.text)}</div>`;

        getEl('inspector-prompt').oninput = (e) => activePanel.prompt = e.target.value;
        getEl('inspector-generate-btn').onclick = generateImage;
        getEl('inspector-ref-prev-frame').onchange = (e) => activePanel.refPrev = e.target.checked;

        // Add click handlers for asset reference buttons
        inspectorPanel.querySelectorAll('.asset-ref-btn').forEach(btn => {
            btn.onclick = () => {
                const assetName = btn.dataset.name;
                const promptTextarea = getEl('inspector-prompt');
                const currentPrompt = promptTextarea.value;
                const assetRef = `[${assetName}]`;

                // Insert at cursor position or append
                const cursorPos = promptTextarea.selectionStart;
                const newPrompt = currentPrompt.slice(0, cursorPos) + assetRef + currentPrompt.slice(cursorPos);

                promptTextarea.value = newPrompt;
                activePanel.prompt = newPrompt;

                // Move cursor after inserted text
                promptTextarea.focus();
                promptTextarea.setSelectionRange(cursorPos + assetRef.length, cursorPos + assetRef.length);
            };
        });
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

    async function generateStyleImage(styleDescription) {
        setBtnLoading(uploadStyleBtn, true, uploadStyleBtn.innerHTML);

        try {
            const result = await callBackendApi('/generate-style', {
                style: styleDescription
            }, 'POST');

            // Update style image state
            styleImage.base64 = result.base64;
            styleImage.mimeType = result.mimeType;

            // Show the generated style image
            styleRefImg.src = result.dataUrl;
            styleRefContainer.classList.remove('hidden');

            showMessageModal('Style reference generated successfully!');

        } catch (error) {
            console.error('Style generation failed:', error);
            showMessageModal('Failed to generate style reference. Please try again.');
        } finally {
            setBtnLoading(uploadStyleBtn, false, '<i data-lucide="wand-2" class="w-4 h-4"></i><span>Generate</span>');
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
            // Process asset references in prompt using [asset_name] syntax
            const assetRegex = /\[(.*?)\]/g;
            const assetImages = [];
            const matches = [...activePanel.prompt.matchAll(assetRegex)];

            matches.forEach(match => {
                const assetName = match[1];
                let foundAsset = null;

                // First, search in legacy projectLibrary
                foundAsset = projectLibrary.find(a => a.name === assetName);

                if (foundAsset) {
                    assetImages.push({
                        base64: foundAsset.base64,
                        mimeType: foundAsset.mimeType,
                        type: 'legacy',
                        name: foundAsset.name
                    });
                } else {
                    // Search in categorized projectAssets
                    Object.entries(projectAssets).forEach(([category, assets]) => {
                        if (!foundAsset) {
                            const asset = assets.find(a => a.name === assetName);
                            if (asset) {
                                foundAsset = asset;
                                assetImages.push({
                                    base64: asset.base64,
                                    mimeType: asset.mimeType,
                                    type: category,
                                    name: asset.name
                                });
                                // Mark as used for consistency tracking
                                asset.isConsistent = true;
                                console.log(`Manual reference: Using ${category} asset "${assetName}"`);
                            }
                        }
                    });
                }

                if (!foundAsset) {
                    console.warn(`Asset "${assetName}" not found in library. Available assets:`, {
                        legacy: projectLibrary.map(a => a.name),
                        characters: projectAssets.characters.map(a => a.name),
                        scenes: projectAssets.scenes.map(a => a.name),
                        props: projectAssets.props.map(a => a.name),
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
            if (styleSelector.value === 'Custom' && customStyleInput.value.trim()) {
                effectiveStyle = customStyleInput.value.trim();
            }

            // --- Enhanced Character & Scene Detection (Whisk-style) ---
            const detectedCharacters = detectCharacterReferences(activePanel.prompt);
            const detectedScenes = detectSceneReferences(activePanel.prompt);

            console.log('Detected characters:', detectedCharacters);
            console.log('Detected scenes:', detectedScenes);

            // Find matching character assets
            const matchingCharacters = findMatchingAssets(detectedCharacters, 'characters');
            const matchingScenes = findMatchingAssets(detectedScenes, 'scenes');

            console.log('Matching character assets:', matchingCharacters.length);
            console.log('Matching scene assets:', matchingScenes.length);

            // Add character and scene assets to the image generation
            matchingCharacters.forEach(character => {
                assetImages.push({
                    base64: character.base64,
                    mimeType: character.mimeType,
                    type: 'character',
                    name: character.name
                });
                // Mark as used for consistency tracking
                character.isConsistent = true;
            });

            matchingScenes.forEach(scene => {
                assetImages.push({
                    base64: scene.base64,
                    mimeType: scene.mimeType,
                    type: 'scene',
                    name: scene.name
                });
                // Mark as used for consistency tracking
                scene.isConsistent = true;
            });

            // Enhance prompt with character and scene context
            let enhancedPrompt = activePanel.prompt;
            if (matchingCharacters.length > 0) {
                const characterNames = matchingCharacters.map(c => c.name).join(', ');
                enhancedPrompt += ` Include the characters: ${characterNames}. Maintain their appearance as shown in the reference images.`;
            }
            if (matchingScenes.length > 0) {
                const sceneNames = matchingScenes.map(s => s.name).join(', ');
                enhancedPrompt += ` Set in the environment/scene: ${sceneNames}. Use the scene reference for visual consistency.`;
            }

            const requestData = {
                prompt: enhancedPrompt,
                style: effectiveStyle,
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

            console.log('Image generation request data:', {
                ...requestData,
                styleImageBase64: requestData.styleImageBase64 ? `[${requestData.styleImageBase64.length} chars]` : null,
                assetImages: requestData.assetImages.map(img => ({ mimeType: img.mimeType, base64: `[${img.base64.length} chars]` }))
            });

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

    async function generateStoryboardFromScript(script, templateType = null, panelCount = 8, customBtn = null) {
        console.log('generateStoryboardFromScript called with:', { script, templateType, panelCount });

        // Use custom button if provided, otherwise find the appropriate button
        const btn = customBtn || getEl('generate-storyboard-btn') || getEl('generate-template-storyboard-btn');
        console.log('Button found:', btn);

        let originalContent, shouldManageLoading = true;

        // Only manage loading if no custom button provided (to avoid duplicate management)
        if (!customBtn && btn) {
            originalContent = btn.innerHTML;
            setBtnLoading(btn, true, originalContent);
        } else if (customBtn) {
            shouldManageLoading = false; // Caller will manage loading
        }

        try {
            console.log('Making API call to /generate-storyboard...');
            const result = await callBackendApi('/generate-storyboard', {
                script,
                templateType,
                panelCount
            }, 'POST');
            console.log('API result received:', result);

            panels = [];
            result.panels.forEach(panelData => addNewPanel(panelData));

            scriptModal.classList.add('hidden');
            templateModal.classList.add('hidden');

            if (panels.length > 0) setActivePanel(panels[0].id);
            else render();
        } catch (error) {
            showMessageModal(`Storyboard Gen Error: ${error.message}`);
            throw error; // Re-throw so caller can handle it
        } finally {
            if (shouldManageLoading && btn) {
                setBtnLoading(btn, false, originalContent);
            }
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

        // Add loading state
        const originalContent = generateTemplateStoryboardBtn.innerHTML;
        setBtnLoading(generateTemplateStoryboardBtn, true, originalContent);

        generateStoryboardFromScript(context, activeTemplate, panelCount, generateTemplateStoryboardBtn).catch((error) => {
            console.error('Template storyboard generation failed:', error);
        }).finally(() => {
            setBtnLoading(generateTemplateStoryboardBtn, false, originalContent);
        });
    };

    // Old generate storyboard handler removed - using the unified one below

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
        console.log('analyzeStory function called');
        if (panels.length < 3) {
            console.log('Not enough panels for analysis:', panels.length);
            showMessageModal("Need at least 3 panels to perform a story analysis.");
            return;
        }

        console.log('Starting story analysis...');
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
        console.log('toggleAnimaticPlay called, current state:', animaticState.isPlaying);
        animaticState.isPlaying = !animaticState.isPlaying;
        animaticPlayPauseBtn.innerHTML = animaticState.isPlaying ? `<i data-lucide="pause"></i>` : `<i data-lucide="play"></i>`;
        lucide.createIcons({ nodes: [animaticPlayPauseBtn] });

        if (animaticState.isPlaying) {
            console.log('Starting animatic playback...');
            showAnimaticPanel(animaticState.currentIndex);
        } else {
            console.log('Pausing animatic...');
            if (animaticState.timer) clearTimeout(animaticState.timer);
        }
    }

    function stopAnimatic() {
        if (animaticState.timer) clearTimeout(animaticState.timer);
        animaticState.isPlaying = false;
        animaticState.currentIndex = 0;
        animaticModal.classList.add('hidden');
    }

    if (previewAnimaticBtn) {
        previewAnimaticBtn.onclick = () => {
            console.log('Preview animatic button clicked');
            console.log('Panels with images:', panels.filter(p => p.imageUrl).length);
            if (panels.filter(p => p.imageUrl).length === 0) {
                showMessageModal("Please generate at least one image to preview the animatic.");
                return;
            }
            console.log('Opening animatic modal');
            animaticModal.classList.remove('hidden');
            toggleAnimaticPlay();
        };
    } else {
        console.error('previewAnimaticBtn not found');
    }

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
    // generateStyleBtn removed - functionality moved to library system
    exportPdfBtn.onclick = exportToPdf;
    exportXmlBtn.onclick = exportToXml;
    if (analyzeStoryBtn) {
        analyzeStoryBtn.onclick = () => {
            console.log('Analyze story button clicked');
            console.log('Number of panels:', panels.length);
            analyzeStory();
        };
    } else {
        console.error('analyzeStoryBtn not found');
    }

    // --- Script Modal Event Handlers ---
    // All script modal handlers are set up dynamically when modal opens via setupScriptModalHandlers()

    // Edit and copy script handlers for the script viewer modal (get fresh references)
    const editScriptBtn = getEl('edit-script-btn');
    const copyCurrentScriptBtn = getEl('copy-current-script-btn');

    if (editScriptBtn) {
        editScriptBtn.onclick = () => {
            scriptViewerModal.classList.add('hidden');
            scriptModal.classList.remove('hidden');
            if (currentScript) {
                switchToScriptMode();
                getEl('script-input').value = currentScript;
            }
        };
    }
    if (copyCurrentScriptBtn) {
        copyCurrentScriptBtn.onclick = () => {
            if (currentScript) {
                copyToClipboard(currentScript);
            }
        };
    }

    // Update the old generate storyboard button to handle both modes
    const generateStoryboardMainBtn = getEl('generate-storyboard-btn');
    if (generateStoryboardMainBtn) {
        generateStoryboardMainBtn.onclick = () => {
            console.log('Generate storyboard button clicked');
            const scriptText = getEl('script-input').value.trim();
            console.log('Script text:', scriptText);
            if (!scriptText) {
                showMessageModal("Please enter a script.");
                return;
            }
            currentScript = scriptText;
            console.log('Calling generateStoryboardFromScript...');

            // Set loading state immediately
            const originalContent = generateStoryboardMainBtn.innerHTML;
            setBtnLoading(generateStoryboardMainBtn, true, originalContent);

            generateStoryboardFromScript(scriptText, null, 8, generateStoryboardMainBtn).catch((error) => {
                console.error('Storyboard generation failed:', error);
            }).finally(() => {
                setBtnLoading(generateStoryboardMainBtn, false, originalContent);
            });
        };
    }

    // Debug script elements (commented out to prevent errors)
    // debugScriptElements();

    addNewPanel({ prompt: "A wide, establishing shot of a futuristic city at sunset." });
});