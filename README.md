# 🚀 Terminology AI Dashboard: Team Setup

Everything you need to evaluate terminology extraction using Large Language Models.

---

## ⚡ Zero-to-Hero: Install Everything (One-Line)

If your teammates have **NOTHING** installed (no Python, no Node.js), tell them to open their terminal inside this folder and run:

### 🐧 For Linux / macOS / WSL:
```bash
bash setup_linux.sh
```

### 🪟 For Windows (PowerShell):
```powershell
winget install -e --id Python.Python.3; winget install -e --id OpenJS.NodeJS; pip install -r requirements.txt; cd dashboard; npm install
```

---

## 🚀 Regular Launch (Once Installed)
If they already have the environment set up, just launch the dashboard:

```bash
cd dashboard
npm run dev
```

### 3. Open in Browser
Visit: **[http://localhost:5173/](http://localhost:5173/)**

---

## 📂 Folder Structure:
- `dashboard/`: The main React-based UI for evaluation.
- `first.ipynb`: Jupyter notebook for experiments.
- `htfl_sentences_with_terms_cleaned.xlsx`: The active dataset.

## 📊 How to Use:
1.  **API Key**: Enter your Nebius Studio API key in the top box.
2.  **Select Project Data**: Use the dashed box to choose `htfl_sentences_with_terms_cleaned.xlsx` from this folder.
3.  **Run Experiments**: Click **Execute Run** to see the benchmark results side-by-side.
4.  **Save Results**: Use the "Export Excel" or "Save Eval View" buttons.
