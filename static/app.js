// app.js - SnapLedger Web Interface JavaScript

class BillProcessorApp {
    constructor() {
        this.selectedFiles = [];
        this.processedResults = [];
        this.categories = [];
        this.categoryRules = [];
        this.categoryGroups = [];
        this.analyticsLoaded = false;
        this.analyticsPage = 1;
        this.analyticsPageSize = 20;
        this.analyticsTotal = 0;
        this.defaultBillDate = '';
        this.manualBillDate = false;
        this.billDateRefreshTimer = null;
        this.init();
    }

    async init() {
        this.setupTabs();
        this.setupEventListeners();
        this.setupAnalyticsEvents();
        this.setupConfigEvents();
        this.setDefaultDate();
        this.startBillDateRefresh();
        this.setDefaultAnalyticsRange();
        await this.loadCategories();
        this.ensureManualResultsVisible();
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach((btn) => {
            btn.addEventListener('click', () => {
                tabs.forEach((b) => b.classList.remove('active'));
                contents.forEach((c) => c.classList.remove('active'));
                btn.classList.add('active');

                const target = document.getElementById(btn.dataset.tabTarget);
                if (target) {
                    target.classList.add('active');
                }

                if (btn.dataset.tabTarget === 'analyticsTab') {
                    if (!this.analyticsLoaded) {
                        this.refreshAnalytics();
                        this.analyticsLoaded = true;
                    }
                }

                if (btn.dataset.tabTarget === 'configTab') {
                    this.loadCategoryGroups(false);
                    this.loadCategoryRules(false);
                }
            });
        });
    }

    setDefaultDate() {
        this.manualBillDate = false;
        this.refreshDefaultBillDate(true);
    }

    refreshDefaultBillDate(force = false) {
        const dateInput = document.getElementById('billDate');
        if (!dateInput) return;

        const today = this.formatDate(new Date());
        const shouldUpdate = force || (!this.manualBillDate && (dateInput.value === '' || dateInput.value === this.defaultBillDate));

        if (shouldUpdate) {
            dateInput.value = today;
            this.defaultBillDate = today;
        } else if (!this.defaultBillDate) {
            this.defaultBillDate = dateInput.value || today;
        }
    }

    startBillDateRefresh() {
        if (this.billDateRefreshTimer) {
            return;
        }
        this.billDateRefreshTimer = setInterval(() => {
            this.refreshDefaultBillDate(false);
        }, 60000);
    }

    ensureManualResultsVisible() {
        this.processedResults = this.processedResults || [];
        this.hideSection('statusSection');
        this.hideSection('filePreview');
        this.showSection('resultsSection');
        this.displayResults();
    }

    setDefaultAnalyticsRange() {
        const startInput = document.getElementById('analyticsStart');
        const endInput = document.getElementById('analyticsEnd');
        if (startInput && endInput) {
            const today = this.formatDate(new Date());
            startInput.value = today;
            endInput.value = today;
        }
    }

    setupEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const browseBtn = document.getElementById('browseBtn');
        const processBtn = document.getElementById('processBtn');
        const saveBtn = document.getElementById('saveBtn');
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        const uploadSelectAll = document.getElementById('uploadSelectAll');
        const billDateInput = document.getElementById('billDate');

        if (!uploadArea || !fileInput || !browseBtn || !processBtn || !saveBtn) {
            return;
        }

        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });

        uploadArea.addEventListener('click', (e) => {
            if (e.target !== browseBtn && !browseBtn.contains(e.target)) {
                fileInput.click();
            }
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files);
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFileSelect(e.dataTransfer.files);
        });

        processBtn.addEventListener('click', () => {
            this.processFiles();
        });

        saveBtn.addEventListener('click', () => {
            this.saveResults();
        });

        if (billDateInput) {
            billDateInput.addEventListener('change', () => {
                const today = this.formatDate(new Date());
                this.manualBillDate = billDateInput.value !== today;
                if (!this.manualBillDate) {
                    this.defaultBillDate = today;
                }
            });
        }


        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => this.bulkDeleteResults());
        }

        if (uploadSelectAll) {
            uploadSelectAll.addEventListener('change', () => {
                const checked = uploadSelectAll.checked;
                document.querySelectorAll('.upload-select').forEach((input) => {
                    input.checked = checked;
                    this.setRowSelected(input.closest('tr'), checked);
                });
            });
        }
    }
    setupAnalyticsEvents() {
        const refreshBtn = document.getElementById('analyticsRefreshBtn');
        const refreshCategoriesBtn = document.getElementById('refreshCategoriesBtn');
        const exportBtn = document.getElementById('analyticsExportBtn');
        const resetBtn = document.getElementById('analyticsResetBtn');
        const bulkDeleteBtn = document.getElementById('analyticsBulkDeleteBtn');
        const selectAll = document.getElementById('analyticsSelectAll');
        const keywordInput = document.getElementById('analyticsKeyword');
        const majorSelect = document.getElementById('analyticsMajor');
        const minorSelect = document.getElementById('analyticsMinor');
        const quickRangeButtons = document.querySelectorAll('.quick-range .chip-btn');
        const prevBtn = document.getElementById('analyticsPrevBtn');
        const nextBtn = document.getElementById('analyticsNextBtn');
        const pageSizeSelect = document.getElementById('analyticsPageSize');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshAnalytics({ resetPage: true }));
        }

        if (refreshCategoriesBtn) {
            refreshCategoriesBtn.addEventListener('click', () => this.refreshAnalytics({ resetPage: true }));
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportAnalyticsBills());
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetAnalyticsFilters());
        }

        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => this.bulkDeleteAnalyticsBills());
        }

        if (selectAll) {
            selectAll.addEventListener('change', () => {
                const checked = selectAll.checked;
                document.querySelectorAll('.analytics-select').forEach((input) => {
                    input.checked = checked;
                    this.setRowSelected(input.closest('tr'), checked);
                });
            });
        }

        if (keywordInput) {
            keywordInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.refreshAnalytics({ resetPage: true });
                }
            });
        }

        if (majorSelect) {
            majorSelect.addEventListener('change', () => {
                this.populateAnalyticsMinorOptions();
            });
        }

        if (minorSelect) {
            minorSelect.addEventListener('change', () => {
                // No-op, wait for refresh
            });
        }

        if (quickRangeButtons.length > 0) {
            quickRangeButtons.forEach((btn) => {
                btn.addEventListener('click', () => {
                    const range = btn.dataset.range;
                    this.applyQuickRange(range);
                    this.refreshAnalytics({ resetPage: true });
                });
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.changeAnalyticsPage(-1));
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.changeAnalyticsPage(1));
        }

        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', () => {
                const size = parseInt(pageSizeSelect.value, 10);
                if (!Number.isNaN(size)) {
                    this.analyticsPageSize = size;
                    this.analyticsPage = 1;
                    this.refreshAnalytics({ resetPage: true });
                }
            });
        }
    }

    setupConfigEvents() {
        const newCategoryForm = document.getElementById('newCategoryForm');
        const refreshCategoryGroupsBtn = document.getElementById('refreshCategoryGroupsBtn');
        const categoryGroupBulkDeleteBtn = document.getElementById('categoryGroupBulkDeleteBtn');
        const categoryGroupSelectAll = document.getElementById('categoryGroupSelectAll');
        const newRuleForm = document.getElementById('newRuleForm');
        const refreshRulesBtn = document.getElementById('refreshRulesBtn');
        const ruleBulkDeleteBtn = document.getElementById('ruleBulkDeleteBtn');
        const ruleSelectAll = document.getElementById('ruleSelectAll');

        if (newCategoryForm) {
            newCategoryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createCategoryGroup();
            });
        }

        if (refreshCategoryGroupsBtn) {
            refreshCategoryGroupsBtn.addEventListener('click', () => this.loadCategoryGroups(true));
        }

        if (categoryGroupBulkDeleteBtn) {
            categoryGroupBulkDeleteBtn.addEventListener('click', () => this.bulkDeleteCategoryGroups());
        }

        if (categoryGroupSelectAll) {
            categoryGroupSelectAll.addEventListener('change', () => {
                const checked = categoryGroupSelectAll.checked;
                document.querySelectorAll('.category-group-select').forEach((input) => {
                    input.checked = checked;
                    this.setRowSelected(input.closest('tr'), checked);
                });
            });
        }

        if (newRuleForm) {
            newRuleForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createCategoryRule();
            });
        }

        if (refreshRulesBtn) {
            refreshRulesBtn.addEventListener('click', () => this.loadCategoryRules(true));
        }

        if (ruleBulkDeleteBtn) {
            ruleBulkDeleteBtn.addEventListener('click', () => this.bulkDeleteCategoryRules());
        }

        if (ruleSelectAll) {
            ruleSelectAll.addEventListener('change', () => {
                const checked = ruleSelectAll.checked;
                document.querySelectorAll('.rule-select').forEach((input) => {
                    input.checked = checked;
                    this.setRowSelected(input.closest('tr'), checked);
                });
            });
        }
    }

    async fetchJson(url, options = {}) {
        const response = await fetch(url, options);
        const data = await response.json();
        if (data.success === false) {
            throw new Error(data.error || '请求失败');
        }
        return data;
    }

    async loadCategories() {
        try {
            const [groupsRes, rulesRes] = await Promise.all([
                this.fetchJson('/api/config/category-groups').catch(() => ({ categories: [] })),
                this.fetchJson('/api/config/categories').catch(() => ({ rules: [] }))
            ]);

            this.categoryGroups = groupsRes.categories || [];
            this.categoryRules = rulesRes.rules || [];
            this.updateCategoryListFromGroups();
            this.populateAnalyticsMajorOptions();
            this.populateAnalyticsMinorOptions();
            this.addCategoriesFromRules();
            this.refreshCategoryOptions();
            this.renderCategoryGroups();
            this.renderCategoryRules();
        } catch (error) {
            console.error('Failed to load categories:', error);
            this.showMessage(`加载分类失败: ${error.message}`, 'error');
        }
    }

    handleFileSelect(files) {
        const validFiles = [];
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        const maxSize = 16 * 1024 * 1024; // 16MB

        for (const file of files) {
            if (!allowedTypes.includes(file.type)) {
                this.showMessage(`文件 ${file.name} 格式不支持，请选择 JPG 或 PNG 格式`, 'error');
                continue;
            }
            if (file.size > maxSize) {
                this.showMessage(`文件 ${file.name} 太大，请选择小于 16MB 的文件`, 'error');
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length > 0) {
            this.selectedFiles = validFiles;
            this.showFilePreview();
            this.scrollToBottom();
        }
    }

    showFilePreview() {
        const previewSection = document.getElementById('filePreview');
        const previewList = document.getElementById('previewList');
        
        if (!previewSection || !previewList) {
            return;
        }

        previewList.innerHTML = '';
        
        this.selectedFiles.forEach((file) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.alt = file.name;
            
            const filename = document.createElement('div');
            filename.className = 'filename';
            filename.textContent = file.name;
            
            previewItem.appendChild(img);
            previewItem.appendChild(filename);
            previewList.appendChild(previewItem);
        });
        
        previewSection.style.display = 'block';
    }

    async processFiles() {
        if (this.selectedFiles.length === 0) {
            this.showMessage('请先选择要处理的文件', 'error');
            return;
        }

        this.refreshDefaultBillDate(false);
        const dateInput = document.getElementById('billDate');
        const billDate = dateInput ? dateInput.value : '';
        if (!billDate) {
            this.showMessage('请选择账单日期', 'error');
            return;
        }

        this.showSection('statusSection');
        this.hideSection('filePreview');

        const formData = new FormData();
        this.selectedFiles.forEach((file) => {
            formData.append('files', file);
        });
        formData.append('bill_date', billDate);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (data.success) {
                const manualResults = (this.processedResults || []).filter((result) => result.is_manual);
                this.processedResults = manualResults.concat(data.results || []);
                this.displayResults();
                this.hideSection('statusSection');
                this.showSection('resultsSection');
                this.scrollToBottom();
            } else {
                throw new Error(data.error || '处理失败');
            }
        } catch (error) {
            this.hideSection('statusSection');
            this.showMessage(`处理失败: ${error.message}`, 'error');
        }
    }

    populateCategoryOptions(select, selectedValue = '', withPlaceholder = false) {
        if (!select) return;
        select.innerHTML = '';

        if (withPlaceholder) {
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '选择分类';
            select.appendChild(placeholder);
        }

        this.categories.forEach((category) => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });

        if (selectedValue && !this.categories.includes(selectedValue)) {
            const customOption = document.createElement('option');
            customOption.value = selectedValue;
            customOption.textContent = selectedValue;
            select.appendChild(customOption);
        }

        select.value = selectedValue || '';
    }

    refreshCategoryOptions() {
        const categorySelects = document.querySelectorAll(
            'select[data-field="category"], select.new-category-select, select.category-select'
        );
        categorySelects.forEach((select) => {
            const currentValue = select.value;
            const placeholder = select.classList.contains('new-category-select') || select.id === 'newRuleCategory';
            this.populateCategoryOptions(select, currentValue, placeholder);
        });
    }
    displayResults() {
        const resultsBody = document.getElementById('resultsBody');
        if (!resultsBody) return;

        resultsBody.innerHTML = '';
        const selectAll = document.getElementById('uploadSelectAll');
        if (selectAll) {
            selectAll.checked = false;
        }

        this.processedResults.forEach((result, index) => {
            const row = document.createElement('tr');

            const selectCell = document.createElement('td');
            const selectInput = document.createElement('input');
            selectInput.type = 'checkbox';
            selectInput.className = 'upload-select';
            selectInput.dataset.index = index;
            selectInput.addEventListener('change', () => {
                this.setRowSelected(row, selectInput.checked);
                this.updateUploadSelectAllState();
            });
            selectCell.appendChild(selectInput);
            
            const previewCell = document.createElement('td');
            if (result.image_data) {
                const img = document.createElement('img');
                img.src = `data:image/jpeg;base64,${result.image_data}`;
                img.className = 'preview-thumb';
                img.onclick = () => this.showImageModal(result.image_data);
                previewCell.appendChild(img);
            }
            
            const merchantCell = document.createElement('td');
            const merchantInput = document.createElement('input');
            merchantInput.type = 'text';
            merchantInput.className = 'editable';
            merchantInput.value = result.merchant || '';
            merchantInput.dataset.field = 'merchant';
            merchantInput.dataset.index = index;
            merchantInput.addEventListener('input', (e) => this.handleFieldChange(e));
            merchantCell.appendChild(merchantInput);
            
            const amountCell = document.createElement('td');
            const amountInput = document.createElement('input');
            amountInput.type = 'number';
            amountInput.step = '0.01';
            amountInput.className = 'editable';
            amountInput.value = result.amount || 0;
            amountInput.dataset.field = 'amount';
            amountInput.dataset.index = index;
            amountInput.addEventListener('input', (e) => this.handleFieldChange(e));
            amountCell.appendChild(amountInput);
            
            const categoryCell = document.createElement('td');
            const categorySelect = document.createElement('select');
            categorySelect.className = 'editable';
            categorySelect.dataset.field = 'category';
            categorySelect.dataset.index = index;
            categorySelect.addEventListener('change', (e) => this.handleFieldChange(e));
            this.populateCategoryOptions(categorySelect, result.category);
            categoryCell.appendChild(categorySelect);
            
            const dateCell = document.createElement('td');
            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.className = 'editable';
            dateInput.value = result.bill_date || (document.getElementById('billDate')?.value || '');
            dateInput.dataset.field = 'bill_date';
            dateInput.dataset.index = index;
            dateInput.addEventListener('change', (e) => this.handleFieldChange(e));
            dateCell.appendChild(dateInput);
            
            const statusCell = document.createElement('td');
            if (result.error) {
                statusCell.innerHTML = '<span class="status-error">处理失败</span>';
                statusCell.title = result.error;
            } else {
                statusCell.innerHTML = '<span class="status-success">成功</span>';
            }

            row.appendChild(selectCell);
            row.appendChild(previewCell);
            row.appendChild(merchantCell);
            row.appendChild(amountCell);
            row.appendChild(categoryCell);
            row.appendChild(dateCell);
            row.appendChild(statusCell);
            
            resultsBody.appendChild(row);

            row.addEventListener('click', (event) => {
                if (event.target.closest('input, select, button, label, img')) {
                    return;
                }
                selectInput.checked = !selectInput.checked;
                this.setRowSelected(row, selectInput.checked);
                this.updateUploadSelectAllState();
            });
        });
        
        this.addNewBillRow();
        this.updateUploadSelectAllState();
    }

    handleFieldChange(event) {
        const index = parseInt(event.target.dataset.index, 10);
        const field = event.target.dataset.field;
        if (Number.isNaN(index) || !field || !this.processedResults[index]) {
            return;
        }

        const value = event.target.value;
        this.processedResults[index][field] = field === 'amount' ? parseFloat(value) : value;
        this.processedResults[index].modified = true;
        event.target.classList.add('modified');
    }

    setRowSelected(row, selected) {
        if (!row) return;
        row.classList.toggle('selected-row', selected);
    }

    updateUploadSelectAllState() {
        const selectAll = document.getElementById('uploadSelectAll');
        if (!selectAll) return;
        const checkboxes = Array.from(document.querySelectorAll('.upload-select'));
        if (checkboxes.length === 0) {
            selectAll.checked = false;
            return;
        }
        selectAll.checked = checkboxes.every((input) => input.checked);
    }

    bulkDeleteResults() {
        const selected = Array.from(document.querySelectorAll('.upload-select:checked'))
            .map((input) => parseInt(input.dataset.index, 10))
            .filter((index) => !Number.isNaN(index));

        if (selected.length === 0) {
            this.showMessage('请先选择要删除的账单', 'error');
            return;
        }

        if (!confirm(`确定要删除选中的 ${selected.length} 条账单吗？`)) {
            return;
        }

        selected.sort((a, b) => b - a).forEach((index) => {
            this.processedResults.splice(index, 1);
        });

        this.displayResults();
    }

    deleteBill(index) {
        if (confirm('确定要删除这条账单记录吗？')) {
            this.processedResults.splice(index, 1);
            this.displayResults();
        }
    }

    addNewBillRow() {
        const resultsBody = document.getElementById('resultsBody');
        if (!resultsBody) return;

        const row = document.createElement('tr');
        row.className = 'add-new-row';

        const selectCell = document.createElement('td');
        selectCell.innerHTML = '';
        
        const previewCell = document.createElement('td');
        previewCell.innerHTML = '<span class="add-icon">➕</span>';
        
        const merchantCell = document.createElement('td');
        const merchantInput = document.createElement('input');
        merchantInput.type = 'text';
        merchantInput.className = 'editable new-bill-input';
        merchantInput.placeholder = '商户名称';
        merchantInput.dataset.field = 'merchant';
        merchantInput.addEventListener('input', () => merchantInput.classList.remove('invalid'));
        merchantCell.appendChild(merchantInput);
        
        const amountCell = document.createElement('td');
        const amountInput = document.createElement('input');
        amountInput.type = 'number';
        amountInput.step = '0.01';
        amountInput.className = 'editable new-bill-input';
        amountInput.placeholder = '金额';
        amountInput.dataset.field = 'amount';
        amountInput.addEventListener('input', () => amountInput.classList.remove('invalid'));
        amountCell.appendChild(amountInput);
        
        const categoryCell = document.createElement('td');
        const categorySelect = document.createElement('select');
        categorySelect.className = 'editable new-bill-input new-category-select';
        categorySelect.dataset.field = 'category';
        this.populateCategoryOptions(categorySelect, '', true);
        categorySelect.addEventListener('change', () => categorySelect.classList.remove('invalid'));
        categoryCell.appendChild(categorySelect);
        
        const dateCell = document.createElement('td');
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.className = 'editable new-bill-input';
        dateInput.value = document.getElementById('billDate')?.value || '';
        dateInput.dataset.field = 'bill_date';
        dateCell.appendChild(dateInput);
        
        const statusCell = document.createElement('td');
        const statusLabel = document.createElement('span');
        statusLabel.className = 'status-new';
        // statusLabel.textContent = '手动添加';
        statusLabel.textContent = '';

        const addBtn = document.createElement('button');
        addBtn.textContent = '添加';
        addBtn.className = 'add-btn';
        addBtn.onclick = () => this.addManualBill(row);
        statusCell.appendChild(statusLabel);
        statusCell.appendChild(addBtn);

        row.appendChild(selectCell);
        row.appendChild(previewCell);
        row.appendChild(merchantCell);
        row.appendChild(amountCell);
        row.appendChild(categoryCell);
        row.appendChild(dateCell);
        row.appendChild(statusCell);
        
        resultsBody.appendChild(row);
    }

    addManualBill(row) {
        const merchantInput = row.querySelector('input[data-field="merchant"]');
        const amountInput = row.querySelector('input[data-field="amount"]');
        const categorySelect = row.querySelector('select[data-field="category"]');
        const dateInput = row.querySelector('input[data-field="bill_date"]');

        [merchantInput, amountInput, categorySelect].forEach((input) => {
            if (input) {
                input.classList.remove('invalid');
            }
        });

        const merchant = merchantInput?.value.trim();
        const category = categorySelect?.value.trim();
        const amountValue = amountInput?.value;
        const amount = parseFloat(amountValue);
        const billDate = dateInput?.value;

        let hasError = false;
        if (!merchant) {
            merchantInput?.classList.add('invalid');
            hasError = true;
        }
        if (!category) {
            categorySelect?.classList.add('invalid');
            hasError = true;
        }
        if (!amountValue || Number.isNaN(amount) || amount <= 0) {
            amountInput?.classList.add('invalid');
            hasError = true;
        }
        if (hasError) {
            this.showMessage('请填写完整的账单信息', 'error');
            return;
        }
        
        const newBill = {
            id: `manual_${Date.now()}`,
            filename: 'manual_entry',
            merchant,
            amount,
            category,
            bill_date: billDate,
            raw_text: [],
            image_data: null,
            error: null,
            is_manual: true,
            modified: true
        };
        
        this.processedResults.push(newBill);
        this.displayResults();
        // this.showMessage('手动账单添加成功', 'success');
        this.scrollToBottom();
    }
    async saveResults() {
        const validResults = this.processedResults.filter((result) => !result.error);
        
        if (validResults.length === 0) {
            this.showMessage('没有可保存的有效结果', 'error');
            return;
        }

        try {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    bills: validResults.map((result) => ({
                        id: result.id,
                        merchant: result.merchant,
                        amount: result.amount,
                        category: result.category,
                        filename: result.filename,
                        bill_date: result.bill_date || document.getElementById('billDate')?.value,
                        is_manual: result.is_manual || false
                    }))
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showMessage(`成功保存 ${data.saved_count} 条账单记录`, 'success');
                this.scrollToBottom();
                setTimeout(() => {
                    this.resetForManualEntry();
                }, 2000);
            } else {
                throw new Error(data.error || '保存失败');
            }
        } catch (error) {
            this.showMessage(`保存失败: ${error.message}`, 'error');
        }
    }

    resetForManualEntry() {
        this.selectedFiles = [];
        this.processedResults = [];
        this.manualBillDate = false;

        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
        }

        this.hideSection('filePreview');
        this.hideSection('statusSection');
        this.showSection('resultsSection');
        this.hideSection('messageArea');

        const previewList = document.getElementById('previewList');
        if (previewList) previewList.innerHTML = '';

        this.refreshDefaultBillDate(true);
        this.displayResults();
        this.scrollToBottom();
    }

    clearAll() {
        this.selectedFiles = [];
        this.processedResults = [];
        
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
        }
        
        this.hideSection('filePreview');
        this.hideSection('statusSection');
        this.hideSection('resultsSection');
        this.hideSection('messageArea');
        
        const previewList = document.getElementById('previewList');
        const resultsBody = document.getElementById('resultsBody');
        if (previewList) previewList.innerHTML = '';
        if (resultsBody) resultsBody.innerHTML = '';
    }

    showSection(sectionId) {
        const element = document.getElementById(sectionId);
        if (element) {
            element.style.display = 'block';
        }
    }

    hideSection(sectionId) {
        const element = document.getElementById(sectionId);
        if (element) {
            element.style.display = 'none';
        }
    }

    showMessage(message, type = 'info', elementId = 'messageArea') {
        const messageArea = document.getElementById(elementId);
        if (!messageArea) return;

        messageArea.textContent = message;
        messageArea.className = `message ${type}`;
        messageArea.style.display = 'block';
        
        setTimeout(() => {
            messageArea.style.display = 'none';
        }, 5000);
    }

    showImageModal(imageData) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            cursor: pointer;
        `;
        
        const img = document.createElement('img');
        img.src = `data:image/jpeg;base64,${imageData}`;
        img.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            border-radius: 10px;
        `;
        
        modal.appendChild(img);
        document.body.appendChild(modal);
        
        modal.onclick = () => {
            document.body.removeChild(modal);
        };
    }

    scrollToBottom() {
        setTimeout(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }, 100);
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    applyQuickRange(range) {
        const startInput = document.getElementById('analyticsStart');
        const endInput = document.getElementById('analyticsEnd');
        if (!startInput || !endInput) return;

        const today = new Date();
        let start = new Date(today);
        let end = new Date(today);

        if (range === 'week') {
            const day = (today.getDay() + 6) % 7;
            start.setDate(today.getDate() - day);
            end = new Date(start);
            end.setDate(start.getDate() + 6);
        } else if (range === 'month') {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (range === 'year') {
            start = new Date(today.getFullYear(), 0, 1);
            end = new Date(today.getFullYear(), 11, 31);
        }

        startInput.value = this.formatDate(start);
        endInput.value = this.formatDate(end);
    }

    resetAnalyticsFilters() {
        const keywordInput = document.getElementById('analyticsKeyword');
        const majorSelect = document.getElementById('analyticsMajor');
        const minorSelect = document.getElementById('analyticsMinor');
        const startInput = document.getElementById('analyticsStart');
        const endInput = document.getElementById('analyticsEnd');

        if (keywordInput) keywordInput.value = '';
        if (majorSelect) majorSelect.value = '';
        if (minorSelect) minorSelect.value = '';

        const today = this.formatDate(new Date());
        if (startInput) startInput.value = today;
        if (endInput) endInput.value = today;

        this.populateAnalyticsMinorOptions();
        this.analyticsPage = 1;
        this.refreshAnalytics({ resetPage: true });
    }

    exportAnalyticsBills() {
        const filters = this.getAnalyticsFilters();
        const query = this.buildQuery(filters);
        window.open(`/api/bills/export${query}`, '_blank');
    }

    changeAnalyticsPage(direction) {
        const nextPage = this.analyticsPage + direction;
        const totalPages = Math.max(1, Math.ceil(this.analyticsTotal / this.analyticsPageSize));
        if (nextPage < 1 || nextPage > totalPages) {
            return;
        }
        this.analyticsPage = nextPage;
        this.refreshAnalytics();
    }

    updateAnalyticsPagination(totalCount) {
        this.analyticsTotal = totalCount || 0;
        const totalPages = Math.max(1, Math.ceil(this.analyticsTotal / this.analyticsPageSize));
        const pageInfo = document.getElementById('analyticsPageInfo');
        const prevBtn = document.getElementById('analyticsPrevBtn');
        const nextBtn = document.getElementById('analyticsNextBtn');
        const pageSizeSelect = document.getElementById('analyticsPageSize');

        if (pageInfo) {
            pageInfo.textContent = `第 ${this.analyticsPage} / ${totalPages} 页 · 共 ${this.analyticsTotal} 条`;
        }

        if (prevBtn) {
            prevBtn.disabled = this.analyticsPage <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = this.analyticsPage >= totalPages;
        }
        if (pageSizeSelect && pageSizeSelect.value !== String(this.analyticsPageSize)) {
            pageSizeSelect.value = String(this.analyticsPageSize);
        }
    }

    buildQuery(params) {
        const search = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value) {
                search.append(key, value);
            }
        });
        const query = search.toString();
        return query ? `?${query}` : '';
    }

    formatCurrency(value) {
        const number = Number(value || 0);
        return number.toFixed(2);
    }

    formatPercent(value) {
        const number = Number(value || 0);
        return `${number.toFixed(1)}%`;
    }
    renderAnalyticsTable(data, bodyId, columns) {
        const body = document.getElementById(bodyId);
        if (!body) return;

        body.innerHTML = '';

        if (!data || data.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = columns.length;
            emptyCell.textContent = '暂无数据';
            emptyRow.appendChild(emptyCell);
            body.appendChild(emptyRow);
            return;
        }

        data.forEach((item) => {
            const row = document.createElement('tr');
            columns.forEach((col) => {
                const cell = document.createElement('td');
                cell.textContent = col.format ? col.format(item[col.key], item) : (item[col.key] ?? '');
                row.appendChild(cell);
            });
            body.appendChild(row);
        });
    }

    renderSummary(summary) {
        if (!summary) return;
        const totalEl = document.getElementById('summaryTotal');
        const countEl = document.getElementById('summaryCount');
        const rangeEl = document.getElementById('summaryRange');
        const countMetaEl = document.getElementById('summaryCountMeta');

        if (totalEl) totalEl.textContent = this.formatCurrency(summary.total_amount);
        if (countEl) countEl.textContent = summary.bill_count || 0;

        if (rangeEl) {
            if (summary.period_start || summary.period_end) {
                rangeEl.textContent = `${summary.period_start || '全部'} ~ ${summary.period_end || '全部'}`;
            } else {
                rangeEl.textContent = '全部时间';
            }
        }

        if (countMetaEl) {
            const categoriesCount = summary.categories ? Object.keys(summary.categories).length : 0;
            countMetaEl.textContent = `${categoriesCount} 个分类`;
        }
    }

    renderCategoryTable(categoryData, totalAmount) {
        const body = document.getElementById('categoryTableBody');
        if (!body) return;

        body.innerHTML = '';

        if (!categoryData || categoryData.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.textContent = '暂无数据';
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }

        categoryData.forEach((item) => {
            const row = document.createElement('tr');
            const percent = item.percentage !== undefined
                ? item.percentage
                : (totalAmount ? (item.amount / totalAmount) * 100 : 0);

            row.innerHTML = `
                <td>${item.category || '未分类'}</td>
                <td>${this.formatCurrency(item.amount)}</td>
                <td>${item.count || 0}</td>
                <td>${this.formatPercent(percent)}</td>
            `;
            body.appendChild(row);
        });
    }

    renderAnalyticsBills(bills) {
        const body = document.getElementById('analyticsBillsBody');
        if (!body) return;

        body.innerHTML = '';
        const selectAll = document.getElementById('analyticsSelectAll');
        if (selectAll) {
            selectAll.checked = false;
        }

        if (!bills || bills.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.textContent = '暂无数据';
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }

        bills.forEach((bill) => {
            const row = document.createElement('tr');
            row.dataset.billId = bill.id;

            const selectCell = document.createElement('td');
            const selectInput = document.createElement('input');
            selectInput.type = 'checkbox';
            selectInput.className = 'analytics-select';
            selectInput.value = bill.id;
            selectInput.addEventListener('change', () => {
                this.setRowSelected(row, selectInput.checked);
                this.updateSelectAllState();
            });
            selectCell.appendChild(selectInput);

            const keywordCell = document.createElement('td');
            const keywordInput = document.createElement('input');
            keywordInput.type = 'text';
            keywordInput.className = 'editable';
            keywordInput.value = bill.merchant || '';
            keywordInput.addEventListener('blur', () => this.autoSaveAnalyticsRow(row));
            keywordCell.appendChild(keywordInput);

            const categoryCell = document.createElement('td');
            const categorySelect = document.createElement('select');
            categorySelect.className = 'editable category-select';
            this.populateCategoryOptions(categorySelect, bill.category);
            categorySelect.addEventListener('change', () => this.autoSaveAnalyticsRow(row));
            categoryCell.appendChild(categorySelect);

            const amountCell = document.createElement('td');
            const amountInput = document.createElement('input');
            amountInput.type = 'number';
            amountInput.step = '0.01';
            amountInput.className = 'editable';
            amountInput.value = bill.amount ?? 0;
            amountInput.addEventListener('blur', () => this.autoSaveAnalyticsRow(row));
            amountCell.appendChild(amountInput);

            const dateCell = document.createElement('td');
            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.className = 'editable';
            dateInput.value = bill.bill_date || '';
            dateInput.addEventListener('change', () => this.autoSaveAnalyticsRow(row));
            dateCell.appendChild(dateInput);

            row.appendChild(selectCell);
            row.appendChild(keywordCell);
            row.appendChild(categoryCell);
            row.appendChild(amountCell);
            row.appendChild(dateCell);

            row.dataset.snapshot = this.getAnalyticsRowSnapshot(row);
            body.appendChild(row);

            row.addEventListener('click', (event) => {
                if (event.target.closest('input, select, button, label')) {
                    return;
                }
                selectInput.checked = !selectInput.checked;
                this.setRowSelected(row, selectInput.checked);
                this.updateSelectAllState();
            });
        });

        this.updateSelectAllState();
    }

    updateSelectAllState() {
        const selectAll = document.getElementById('analyticsSelectAll');
        if (!selectAll) return;
        const checkboxes = Array.from(document.querySelectorAll('.analytics-select'));
        if (checkboxes.length === 0) {
            selectAll.checked = false;
            return;
        }
        selectAll.checked = checkboxes.every((input) => input.checked);
    }

    async bulkDeleteAnalyticsBills() {
        const selected = Array.from(document.querySelectorAll('.analytics-select:checked'))
            .map((input) => parseInt(input.value, 10))
            .filter((id) => !Number.isNaN(id));

        if (selected.length === 0) {
            this.showMessage('请先选择要删除的账单', 'error', 'analyticsMessage');
            return;
        }

        if (!confirm(`确定要删除选中的 ${selected.length} 条账单吗？`)) {
            return;
        }

        try {
            for (const billId of selected) {
                await this.fetchJson(`/api/bills/${billId}`, { method: 'DELETE' });
            }
            this.showMessage('批量删除完成', 'success', 'analyticsMessage');
            this.refreshAnalytics();
        } catch (error) {
            this.showMessage(`批量删除失败: ${error.message}`, 'error', 'analyticsMessage');
        }
    }

    getAnalyticsRowSnapshot(row) {
        const merchant = row.querySelector('td:nth-child(2) input')?.value.trim() || '';
        const category = row.querySelector('td:nth-child(3) select')?.value.trim() || '';
        const amount = row.querySelector('td:nth-child(4) input')?.value || '';
        const billDate = row.querySelector('td:nth-child(5) input')?.value || '';
        return JSON.stringify({ merchant, category, amount, billDate });
    }

    autoSaveAnalyticsRow(row) {
        if (!row) return;
        const nextSnapshot = this.getAnalyticsRowSnapshot(row);
        if (row.dataset.snapshot === nextSnapshot) {
            return;
        }
        this.updateAnalyticsBill(row, true).then((updated) => {
            if (updated) {
                row.dataset.snapshot = nextSnapshot;
            }
        });
    }

    async updateAnalyticsBill(row, silent = false) {
        const billId = parseInt(row.dataset.billId, 10);
        if (Number.isNaN(billId)) return;

        const merchant = row.querySelector('td:nth-child(2) input')?.value.trim();
        const category = row.querySelector('td:nth-child(3) select')?.value.trim();
        const amountValue = row.querySelector('td:nth-child(4) input')?.value;
        const billDate = row.querySelector('td:nth-child(5) input')?.value;
        const amount = parseFloat(amountValue);

        if (!merchant || !category) {
            this.showMessage('关键词和分类不能为空', 'error', 'analyticsMessage');
            return;
        }
        if (Number.isNaN(amount) || amount < 0) {
            this.showMessage('金额必须为非负数字', 'error', 'analyticsMessage');
            return;
        }

        try {
            await this.fetchJson(`/api/bills/${billId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    merchant,
                    category,
                    amount,
                    bill_date: billDate
                })
            });
            if (!silent) {
                this.showMessage('账单已更新', 'success', 'analyticsMessage');
            }
            return true;
        } catch (error) {
            this.showMessage(`更新失败: ${error.message}`, 'error', 'analyticsMessage');
            return false;
        }
    }

    async deleteAnalyticsBill(billId) {
        if (!confirm('确定要删除该账单吗？')) return;

        try {
            await this.fetchJson(`/api/bills/${billId}`, { method: 'DELETE' });
            this.showMessage('账单已删除', 'success', 'analyticsMessage');
            this.refreshAnalytics();
        } catch (error) {
            this.showMessage(`删除失败: ${error.message}`, 'error', 'analyticsMessage');
        }
    }

    getAnalyticsFilters() {
        const startDate = document.getElementById('analyticsStart')?.value;
        const endDate = document.getElementById('analyticsEnd')?.value;
        const keyword = document.getElementById('analyticsKeyword')?.value.trim();
        const major = document.getElementById('analyticsMajor')?.value;
        const minor = document.getElementById('analyticsMinor')?.value;
        return {
            start_date: startDate,
            end_date: endDate,
            keyword,
            major,
            minor
        };
    }

    async refreshAnalytics(options = {}) {
        if (options.resetPage) {
            this.analyticsPage = 1;
        }
        const filters = this.getAnalyticsFilters();
        const query = this.buildQuery(filters);
        const offset = (this.analyticsPage - 1) * this.analyticsPageSize;

        this.showMessage('正在加载统计...', 'info', 'analyticsMessage');

        try {
            const [summaryRes, categoryRes, billsRes] = await Promise.all([
                this.fetchJson(`/api/analytics/summary${query}`),
                this.fetchJson(`/api/analytics/categories${query}`),
                this.fetchJson(`/api/bills${this.buildQuery({
                    ...filters,
                    limit: this.analyticsPageSize,
                    offset
                })}`)
            ]);

            this.renderSummary(summaryRes.summary);
            this.renderCategoryTable(categoryRes.category_data, categoryRes.total_amount);
            this.renderAnalyticsBills(billsRes.bills || []);
            this.updateAnalyticsPagination(billsRes.total_count || 0);
            this.showMessage('统计已更新', 'success', 'analyticsMessage');
        } catch (error) {
            this.showMessage(`加载统计失败: ${error.message}`, 'error', 'analyticsMessage');
        }
    }

    updateCategoryListFromGroups() {
        this.categories = (this.categoryGroups || [])
            .map((group) => group.full_name)
            .filter((name) => name);
    }

    populateAnalyticsMajorOptions() {
        const majorSelect = document.getElementById('analyticsMajor');
        if (!majorSelect) return;

        const currentValue = majorSelect.value;
        const majors = Array.from(new Set(
            (this.categoryGroups || []).map((group) => group.major).filter((name) => name)
        )).sort((a, b) => a.localeCompare(b));

        majorSelect.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = '全部';
        majorSelect.appendChild(allOption);

        majors.forEach((major) => {
            const option = document.createElement('option');
            option.value = major;
            option.textContent = major;
            majorSelect.appendChild(option);
        });

        majorSelect.value = currentValue || '';
    }

    populateAnalyticsMinorOptions() {
        const majorSelect = document.getElementById('analyticsMajor');
        const minorSelect = document.getElementById('analyticsMinor');
        if (!minorSelect) return;

        const selectedMajor = majorSelect ? majorSelect.value : '';
        const minors = Array.from(new Set(
            (this.categoryGroups || [])
                .filter((group) => !selectedMajor || group.major === selectedMajor)
                .map((group) => group.minor)
                .filter((name) => name)
        )).sort((a, b) => a.localeCompare(b));

        const currentValue = minorSelect.value;
        minorSelect.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = '全部';
        minorSelect.appendChild(allOption);

        minors.forEach((minor) => {
            const option = document.createElement('option');
            option.value = minor;
            option.textContent = minor;
            minorSelect.appendChild(option);
        });

        if (minors.includes(currentValue)) {
            minorSelect.value = currentValue;
        } else {
            minorSelect.value = '';
        }
    }

    addCategoriesFromRules() {
        const categorySet = new Set(this.categories);
        (this.categoryRules || []).forEach((rule) => {
            if (rule.category) {
                categorySet.add(rule.category);
            }
        });
        this.categories = Array.from(categorySet);
    }

    async loadCategoryGroups(showToast = false) {
        try {
            const data = await this.fetchJson('/api/config/category-groups');
            this.categoryGroups = data.categories || [];
            this.updateCategoryListFromGroups();
            this.populateAnalyticsMajorOptions();
            this.populateAnalyticsMinorOptions();
            this.addCategoriesFromRules();
            this.renderCategoryGroups();
            this.refreshCategoryOptions();
            if (showToast) {
                this.showMessage('分类已刷新', 'success', 'configMessage');
            }
        } catch (error) {
            this.showMessage(`加载分类失败: ${error.message}`, 'error', 'configMessage');
        }
    }

    async loadCategoryRules(showToast = false) {
        try {
            const data = await this.fetchJson('/api/config/categories');
            this.categoryRules = data.rules || [];
            this.updateCategoryListFromGroups();
            this.addCategoriesFromRules();
            this.renderCategoryRules();
            this.refreshCategoryOptions();
            if (showToast) {
                this.showMessage('规则已刷新', 'success', 'configMessage');
            }
        } catch (error) {
            this.showMessage(`加载规则失败: ${error.message}`, 'error', 'configMessage');
        }
    }

    renderCategoryGroups() {
        const body = document.getElementById('categoryGroupTableBody');
        if (!body) return;

        body.innerHTML = '';
        const selectAll = document.getElementById('categoryGroupSelectAll');
        if (selectAll) {
            selectAll.checked = false;
        }

        if (!this.categoryGroups || this.categoryGroups.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.textContent = '暂无分类';
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }

        this.categoryGroups.forEach((group) => {
            const row = document.createElement('tr');
            row.dataset.categoryId = group.id;
            row.dataset.fullName = group.full_name;

            const selectCell = document.createElement('td');
            const selectInput = document.createElement('input');
            selectInput.type = 'checkbox';
            selectInput.className = 'category-group-select';
            selectInput.value = group.id;
            selectInput.addEventListener('change', () => {
                this.setRowSelected(row, selectInput.checked);
                this.updateCategoryGroupSelectAllState();
            });
            selectCell.appendChild(selectInput);

            const majorCell = document.createElement('td');
            const majorInput = document.createElement('input');
            majorInput.type = 'text';
            majorInput.value = group.major || '';
            majorInput.className = 'editable';
            majorInput.dataset.field = 'major';
            majorInput.addEventListener('blur', () => this.autoSaveCategoryGroupRow(row));
            majorCell.appendChild(majorInput);

            const minorCell = document.createElement('td');
            const minorInput = document.createElement('input');
            minorInput.type = 'text';
            minorInput.value = group.minor || '';
            minorInput.className = 'editable';
            minorInput.dataset.field = 'minor';
            minorInput.addEventListener('blur', () => this.autoSaveCategoryGroupRow(row));
            minorCell.appendChild(minorInput);

            const nameCell = document.createElement('td');
            nameCell.textContent = group.full_name || '';
            row.appendChild(selectCell);
            row.appendChild(majorCell);
            row.appendChild(minorCell);
            row.appendChild(nameCell);

            body.appendChild(row);

            row.dataset.snapshot = this.getCategoryGroupSnapshot(row);
            row.addEventListener('click', (event) => {
                if (event.target.closest('input, select, button, label')) {
                    return;
                }
                selectInput.checked = !selectInput.checked;
                this.setRowSelected(row, selectInput.checked);
                this.updateCategoryGroupSelectAllState();
            });
        });

        this.updateCategoryGroupSelectAllState();
    }

    getCategoryGroupSnapshot(row) {
        const major = row.querySelector('input[data-field="major"]')?.value.trim() || '';
        const minor = row.querySelector('input[data-field="minor"]')?.value.trim() || '';
        return JSON.stringify({ major, minor });
    }

    autoSaveCategoryGroupRow(row) {
        if (!row) return;
        const nextSnapshot = this.getCategoryGroupSnapshot(row);
        if (row.dataset.snapshot === nextSnapshot) {
            return;
        }
        this.updateCategoryGroup(row, true).then((updated) => {
            if (updated) {
                row.dataset.snapshot = nextSnapshot;
            }
        });
    }

    updateCategoryGroupSelectAllState() {
        const selectAll = document.getElementById('categoryGroupSelectAll');
        if (!selectAll) return;
        const checkboxes = Array.from(document.querySelectorAll('.category-group-select'));
        if (checkboxes.length === 0) {
            selectAll.checked = false;
            return;
        }
        selectAll.checked = checkboxes.every((input) => input.checked);
    }

    async bulkDeleteCategoryGroups() {
        const selected = Array.from(document.querySelectorAll('.category-group-select:checked'))
            .map((input) => parseInt(input.value, 10))
            .filter((id) => !Number.isNaN(id));

        if (selected.length === 0) {
            this.showMessage('请先选择要删除的分类', 'error', 'configMessage');
            return;
        }

        if (!confirm(`确定要删除选中的 ${selected.length} 个分类吗？`)) {
            return;
        }

        try {
            for (const categoryId of selected) {
                await this.fetchJson(`/api/config/category-groups/${categoryId}`, { method: 'DELETE' });
            }
            this.showMessage('分类已批量删除', 'success', 'configMessage');
            this.loadCategoryGroups(false);
        } catch (error) {
            this.showMessage(`批量删除失败: ${error.message}`, 'error', 'configMessage');
        }
    }

    async createCategoryGroup() {
        const majorInput = document.getElementById('newCategoryMajor');
        const minorInput = document.getElementById('newCategoryMinor');
        const major = majorInput?.value.trim();
        const minor = minorInput?.value.trim();

        if (!major) {
            this.showMessage('请输入大类名称', 'error', 'configMessage');
            return;
        }

        try {
            const data = await this.fetchJson('/api/config/category-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    major,
                    minor
                })
            });

            if (data.category) {
                this.categoryGroups.push(data.category);
                this.categoryGroups.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
                this.updateCategoryListFromGroups();
                this.addCategoriesFromRules();
                this.renderCategoryGroups();
                this.refreshCategoryOptions();
            }

            this.showMessage('分类新增成功', 'success', 'configMessage');
            if (majorInput) majorInput.value = '';
            if (minorInput) minorInput.value = '';
        } catch (error) {
            this.showMessage(`新增分类失败: ${error.message}`, 'error', 'configMessage');
        }
    }

    async updateCategoryGroup(row, silent = false) {
        const categoryId = parseInt(row.dataset.categoryId, 10);
        if (Number.isNaN(categoryId)) return;

        const major = row.querySelector('input[data-field="major"]')?.value.trim();
        const minor = row.querySelector('input[data-field="minor"]')?.value.trim();

        if (!major) {
            this.showMessage('大类不能为空', 'error', 'configMessage');
            return;
        }

        const oldFullName = row.dataset.fullName;

        try {
            const data = await this.fetchJson(`/api/config/category-groups/${categoryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    major,
                    minor
                })
            });

            if (data.category) {
                const index = this.categoryGroups.findIndex((group) => group.id === categoryId);
                if (index >= 0) {
                    this.categoryGroups[index] = data.category;
                }
                const newFullName = data.category.full_name;
                row.dataset.fullName = newFullName;
                this.categoryRules = (this.categoryRules || []).map((rule) => ({
                    ...rule,
                    category: rule.category === oldFullName ? newFullName : rule.category
                }));
                this.updateCategoryListFromGroups();
                this.addCategoriesFromRules();
                this.renderCategoryGroups();
                this.renderCategoryRules();
                this.refreshCategoryOptions();
            }

            if (!silent) {
                this.showMessage('分类已更新', 'success', 'configMessage');
            }
            return true;
        } catch (error) {
            this.showMessage(`更新分类失败: ${error.message}`, 'error', 'configMessage');
            return false;
        }
    }

    async deleteCategoryGroup(categoryId) {
        if (!confirm('确定要删除该分类吗？')) return;

        try {
            await this.fetchJson(`/api/config/category-groups/${categoryId}`, { method: 'DELETE' });
            this.categoryGroups = this.categoryGroups.filter((group) => group.id !== categoryId);
            this.updateCategoryListFromGroups();
            this.addCategoriesFromRules();
            this.renderCategoryGroups();
            this.refreshCategoryOptions();
            this.showMessage('分类已删除', 'success', 'configMessage');
        } catch (error) {
            this.showMessage(`删除分类失败: ${error.message}`, 'error', 'configMessage');
        }
    }

    renderCategoryRules() {
        const body = document.getElementById('ruleTableBody');
        if (!body) return;

        body.innerHTML = '';
        const selectAll = document.getElementById('ruleSelectAll');
        if (selectAll) {
            selectAll.checked = false;
        }

        if (!this.categoryRules || this.categoryRules.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.textContent = '暂无规则';
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }

        this.categoryRules.forEach((rule) => {
            const row = document.createElement('tr');
            row.dataset.ruleId = rule.id;

            const selectCell = document.createElement('td');
            const selectInput = document.createElement('input');
            selectInput.type = 'checkbox';
            selectInput.className = 'rule-select';
            selectInput.value = rule.id;
            selectInput.addEventListener('change', () => {
                this.setRowSelected(row, selectInput.checked);
                this.updateRuleSelectAllState();
            });
            selectCell.appendChild(selectInput);

            const keywordCell = document.createElement('td');
            const keywordInput = document.createElement('input');
            keywordInput.type = 'text';
            keywordInput.value = rule.keyword;
            keywordInput.className = 'editable';
            keywordInput.dataset.field = 'keyword';
            keywordInput.addEventListener('blur', () => this.autoSaveCategoryRuleRow(row));
            keywordCell.appendChild(keywordInput);

            const categoryCell = document.createElement('td');
            const categorySelect = document.createElement('select');
            categorySelect.className = 'editable category-select';
            categorySelect.dataset.field = 'category';
            this.populateCategoryOptions(categorySelect, rule.category);
            categorySelect.addEventListener('change', () => this.autoSaveCategoryRuleRow(row));
            categoryCell.appendChild(categorySelect);

            const priorityCell = document.createElement('td');
            const priorityInput = document.createElement('input');
            priorityInput.type = 'number';
            priorityInput.value = rule.priority;
            priorityInput.className = 'editable';
            priorityInput.dataset.field = 'priority';
            priorityInput.addEventListener('blur', () => this.autoSaveCategoryRuleRow(row));
            priorityCell.appendChild(priorityInput);

            const weakCell = document.createElement('td');
            const weakInput = document.createElement('input');
            weakInput.type = 'checkbox';
            weakInput.checked = !!rule.is_weak;
            weakInput.dataset.field = 'is_weak';
            weakInput.addEventListener('change', () => this.autoSaveCategoryRuleRow(row));
            weakCell.appendChild(weakInput);

            row.appendChild(selectCell);
            row.appendChild(keywordCell);
            row.appendChild(categoryCell);
            row.appendChild(priorityCell);
            row.appendChild(weakCell);

            body.appendChild(row);

            row.dataset.snapshot = this.getCategoryRuleSnapshot(row);
            row.addEventListener('click', (event) => {
                if (event.target.closest('input, select, button, label')) {
                    return;
                }
                selectInput.checked = !selectInput.checked;
                this.setRowSelected(row, selectInput.checked);
                this.updateRuleSelectAllState();
            });
        });

        this.updateRuleSelectAllState();
    }

    getCategoryRuleSnapshot(row) {
        const keyword = row.querySelector('input[data-field="keyword"]')?.value.trim() || '';
        const category = row.querySelector('select[data-field="category"]')?.value.trim() || '';
        const priority = row.querySelector('input[data-field="priority"]')?.value || '';
        const isWeak = row.querySelector('input[data-field="is_weak"]')?.checked ? '1' : '0';
        return JSON.stringify({ keyword, category, priority, isWeak });
    }

    autoSaveCategoryRuleRow(row) {
        if (!row) return;
        const nextSnapshot = this.getCategoryRuleSnapshot(row);
        if (row.dataset.snapshot === nextSnapshot) {
            return;
        }
        this.updateCategoryRule(row, true).then((updated) => {
            if (updated) {
                row.dataset.snapshot = nextSnapshot;
            }
        });
    }

    updateRuleSelectAllState() {
        const selectAll = document.getElementById('ruleSelectAll');
        if (!selectAll) return;
        const checkboxes = Array.from(document.querySelectorAll('.rule-select'));
        if (checkboxes.length === 0) {
            selectAll.checked = false;
            return;
        }
        selectAll.checked = checkboxes.every((input) => input.checked);
    }

    async bulkDeleteCategoryRules() {
        const selected = Array.from(document.querySelectorAll('.rule-select:checked'))
            .map((input) => parseInt(input.value, 10))
            .filter((id) => !Number.isNaN(id));

        if (selected.length === 0) {
            this.showMessage('请先选择要删除的规则', 'error', 'configMessage');
            return;
        }

        if (!confirm(`确定要删除选中的 ${selected.length} 条规则吗？`)) {
            return;
        }

        try {
            for (const ruleId of selected) {
                await this.fetchJson(`/api/config/categories/${ruleId}`, { method: 'DELETE' });
            }
            this.showMessage('规则已批量删除', 'success', 'configMessage');
            this.loadCategoryRules(false);
        } catch (error) {
            this.showMessage(`批量删除失败: ${error.message}`, 'error', 'configMessage');
        }
    }

    async createCategoryRule() {
        const keywordInput = document.getElementById('newRuleKeyword');
        const categorySelect = document.getElementById('newRuleCategory');
        const priorityInput = document.getElementById('newRulePriority');
        const weakInput = document.getElementById('newRuleWeak');

        const keyword = keywordInput?.value.trim();
        const category = categorySelect?.value.trim();
        const priority = priorityInput?.value || 1;
        const isWeak = weakInput?.checked || false;

        if (!keyword || !category) {
            this.showMessage('请输入关键词和分类', 'error', 'configMessage');
            return;
        }

        try {
            const data = await this.fetchJson('/api/config/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword,
                    category,
                    priority: parseInt(priority, 10) || 1,
                    is_weak: isWeak
                })
            });

            if (data.rule) {
                this.categoryRules.unshift(data.rule);
                this.addCategoriesFromRules();
                this.renderCategoryRules();
                this.refreshCategoryOptions();
            }

            this.showMessage('新增规则成功', 'success', 'configMessage');
            if (keywordInput) keywordInput.value = '';
            if (categorySelect) categorySelect.value = '';
            if (priorityInput) priorityInput.value = '1';
            if (weakInput) weakInput.checked = false;
        } catch (error) {
            this.showMessage(`新增失败: ${error.message}`, 'error', 'configMessage');
        }
    }

    async updateCategoryRule(row, silent = false) {
        const ruleId = parseInt(row.dataset.ruleId, 10);
        if (Number.isNaN(ruleId)) return;

        const keyword = row.querySelector('input[data-field="keyword"]')?.value.trim();
        const category = row.querySelector('select[data-field="category"]')?.value.trim();
        const priorityValue = row.querySelector('input[data-field="priority"]')?.value;
        const isWeak = row.querySelector('input[data-field="is_weak"]')?.checked || false;

        if (!keyword || !category) {
            this.showMessage('关键词和分类不能为空', 'error', 'configMessage');
            return;
        }

        try {
            const data = await this.fetchJson(`/api/config/categories/${ruleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword,
                    category,
                    priority: parseInt(priorityValue, 10) || 1,
                    is_weak: isWeak
                })
            });

            if (data.rule) {
                const index = this.categoryRules.findIndex((r) => r.id === ruleId);
                if (index >= 0) {
                    this.categoryRules[index] = data.rule;
                }
            }
            this.addCategoriesFromRules();
            this.refreshCategoryOptions();
            if (!silent) {
                this.showMessage('规则已更新', 'success', 'configMessage');
            }
            return true;
        } catch (error) {
            this.showMessage(`更新失败: ${error.message}`, 'error', 'configMessage');
            return false;
        }
    }

    async deleteCategoryRule(ruleId) {
        if (!confirm('确定要删除该规则吗？')) return;

        try {
            await this.fetchJson(`/api/config/categories/${ruleId}`, { method: 'DELETE' });
            this.categoryRules = this.categoryRules.filter((rule) => rule.id !== ruleId);
            this.addCategoriesFromRules();
            this.renderCategoryRules();
            this.refreshCategoryOptions();
            this.showMessage('规则已删除', 'success', 'configMessage');
        } catch (error) {
            this.showMessage(`删除失败: ${error.message}`, 'error', 'configMessage');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BillProcessorApp();
});
