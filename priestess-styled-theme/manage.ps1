# ==========================================================================
# 普瑞赛斯 · 源石协议 — Arknights theme plugin manager (dsh 0.1.5+)
#
#   .\manage.ps1 install     安装并启用插件
#   .\manage.ps1 enable      重新启用（移除 disabled）
#   .\manage.ps1 disable     停用插件（保留安装）
#   .\manage.ps1 uninstall   卸载插件并还原配置
#   .\manage.ps1 status      查看插件状态
#
# 安装方式（新版本 dsh）：把插件登记为 profile 的 bundle
#   - 复制到 $DSH_HOME\profiles\node_modules\<plugin>
#   - 在 profile 的 package.json 里登记 file: 依赖 + dsh.profile.bundles
#   - 插件自带的 cordis.patch.yml 负责插入 Loader 条目
# 全过程不改动 dsh 自带文件，升级 dsh 后只需重新 install。
#
# 老版本 dsh（无 dsh.profile.bundles）：加 -Legacy，改为直接写 profile 的
# cordis.patch.yml insert 段。
#
# 可选参数：
#   -DshHome <path>   指定 DSH_HOME（默认 $env:DSH_HOME，否则 ~\.dsh）
#   -Profile <name>   指定 profile 名（默认 web）
# ==========================================================================
param(
  [ValidateSet("install", "enable", "disable", "uninstall", "status")]
  [string]$Action = "install",
  [string]$DshHome = "",
  [string]$Profile = "web",
  [switch]$Legacy
)

$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
if (-not $DshHome) {
  $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" }
}
$pluginName = "priestess-styled-theme"
$target = Join-Path $DshHome "profiles\node_modules\$pluginName"
$profileDir = Join-Path $DshHome "profiles\$Profile"
$profilePkg = Join-Path $profileDir "package.json"
$yml = Join-Path $profileDir "cordis.patch.yml"
$utf8 = New-Object System.Text.UTF8Encoding($false)

# 旧版本安装遗留的条目 id（新版本统一为 $pluginName）
$legacyId = "arknights-theme"

function Read-Text([string]$path) { [System.IO.File]::ReadAllText($path, $utf8) }
function Write-Text([string]$path, [string]$text) {
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $text, $utf8)
}

# ---------- profile package.json ----------
function Read-ProfilePkg {
  if (-not (Test-Path $profilePkg)) { return $null }
  return (Read-Text $profilePkg | ConvertFrom-Json)
}
function Write-ProfilePkg($pkg) {
  Write-Text $profilePkg (($pkg | ConvertTo-Json -Depth 12) + "`n")
}
function Get-BundleList($pkg) {
  $bundles = @()
  if ($pkg.PSObject.Properties.Name -contains "dsh" -and $pkg.dsh -and ($pkg.dsh.PSObject.Properties.Name -contains "profile") -and $pkg.dsh.profile) {
    if ($pkg.dsh.profile.PSObject.Properties.Name -contains "bundles" -and $pkg.dsh.profile.bundles) {
      $bundles = @($pkg.dsh.profile.bundles)
    }
  }
  return $bundles
}
function Add-ProfileBundle {
  if (-not (Test-Path $profilePkg)) {
    Write-Host "    ! 未找到 profile package.json: $profilePkg"
    return $false
  }
  $pkg = Read-ProfilePkg
  if (-not ($pkg.PSObject.Properties.Name -contains "dependencies") -or -not $pkg.dependencies) {
    $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue (New-Object psobject) -Force
  }
  $dep = "file:../node_modules/$pluginName"
  $pkg.dependencies | Add-Member -NotePropertyName $pluginName -NotePropertyValue $dep -Force

  if (-not ($pkg.PSObject.Properties.Name -contains "dsh") -or -not $pkg.dsh) {
    $pkg | Add-Member -NotePropertyName dsh -NotePropertyValue (New-Object psobject) -Force
  }
  if (-not ($pkg.dsh.PSObject.Properties.Name -contains "profile") -or -not $pkg.dsh.profile) {
    $pkg.dsh | Add-Member -NotePropertyName profile -NotePropertyValue (New-Object psobject) -Force
  }
  $bundles = @(Get-BundleList $pkg)
  if ($bundles -notcontains $pluginName) { $bundles += $pluginName }
  $pkg.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue $bundles -Force
  Write-ProfilePkg $pkg
  return $true
}
function Remove-ProfileBundle {
  if (-not (Test-Path $profilePkg)) { return $false }
  $pkg = Read-ProfilePkg
  $changed = $false
  if (($pkg.PSObject.Properties.Name -contains "dependencies") -and $pkg.dependencies -and ($pkg.dependencies.PSObject.Properties.Name -contains $pluginName)) {
    $pkg.dependencies.PSObject.Properties.Remove($pluginName)
    $changed = $true
  }
  $bundles = @(Get-BundleList $pkg) | Where-Object { $_ -ne $pluginName }
  if ($changed -or ($bundles.Count -ne @(Get-BundleList $pkg).Count)) {
    if (($pkg.PSObject.Properties.Name -contains "dsh") -and $pkg.dsh -and ($pkg.dsh.PSObject.Properties.Name -contains "profile") -and $pkg.dsh.profile) {
      $pkg.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @($bundles) -Force
    }
    Write-ProfilePkg $pkg
    return $true
  }
  return $false
}

# ---------- profile cordis.patch.yml ----------
function Has-LoaderEntry([string]$s) {
  return ($s -match "(?m)^\s+name:\s*'?$([regex]::Escape($pluginName))'?\s*$") -or
         ($s -match "(?m)^\s*- id:\s*'?$([regex]::Escape($pluginName))'?\s*$")
}
function Has-DisableRow([string]$s) {
  return $s -match "(?m)^- id:\s*'?$([regex]::Escape($pluginName))'?\s*\r?\n\s+disabled:\s*true\s*$"
}
function Has-EnableRow([string]$s) {
  return $s -match "(?m)^- id:\s*'?$([regex]::Escape($pluginName))'?\s*\r?\n\s+disabled:\s*false\s*$"
}
function Remove-LegacyInsert([string]$s) {
  # 移除旧版本写下的 insert 段（新版本由插件自带 patch 负责，重复会触发
  # client-modules 的 "resolves from multiple active Loader sources"）
  $pattern = "(?ms)^- insert:\s*\r?\n\s+- id:\s*'?$([regex]::Escape($legacyId))'?\s*\r?\n\s+name:\s*'?$([regex]::Escape($pluginName))'?[^\r\n]*(\r?\n\s+disabled:\s*(true|false)[^\r\n]*)?\r?\n?"
  return [regex]::Replace($s, $pattern, "")
}
function Normalize-Yml([string]$s) {
  # 只保留注释会导致 dsh 启动报错（"empty or comments-only file fails boot"），
  # 因此没有实体条目时补上空数组行，同时保留原有注释。
  $body = ($s -replace "(?m)^\s*#.*$", "").Trim()
  if ($body -eq "") { return $s.TrimEnd() + "`n[]`n" }
  return $s
}
function Set-DisableRow([string]$s, [bool]$disabled) {
  $s = [regex]::Replace($s, "(?m)^- id:\s*'?$([regex]::Escape($pluginName))'?\s*\r?\n\s+disabled:\s*(true|false)[^\r\n]*\r?\n?", "")
  $state = if ($disabled) { "true" } else { "false" }
  return $s.TrimEnd() + "`n- id: $pluginName`n  disabled: $state`n"
}

Write-Host "=== 普瑞赛斯 · 源石协议 插件管理 ==="
Write-Host "DSH_HOME : $DshHome"
$modeLabel = if ($Legacy) { "  (legacy 安装模式)" } else { "" }
Write-Host "Profile  : $Profile$modeLabel"
Write-Host ""

switch ($Action) {
  "install" {
    if (-not (Test-Path $target)) {
      Copy-Item $repoRoot $target -Recurse -Force
      Write-Host "[1/3] 插件已复制到 profile: $target"
    } else {
      Copy-Item (Join-Path $repoRoot "*") $target -Recurse -Force
      Write-Host "[1/3] 插件已更新: $target"
    }

    if ($Legacy) {
      $insertBlock = "- insert:`n    - id: $pluginName`n      name: '$pluginName'"
      if (-not (Test-Path $yml)) {
        Write-Text $yml ($insertBlock + "`n")
        Write-Host "[2/3] 已创建 cordis.patch.yml 并启用插件（legacy）"
      } else {
        $s = Read-Text $yml
        if (Has-LoaderEntry $s) {
          Write-Host "[2/3] 配置中已有插件条目（幂等）"
        } elseif ($s -match "(?m)^\[\s*\]\s*$") {
          Write-Text $yml ($s -replace "(?m)^\[\s*\]\s*$", ($insertBlock + "`n"))
          Write-Host "[2/3] 已在 cordis.patch.yml 插入插件条目（legacy）"
        } else {
          Write-Text $yml ($s.TrimEnd() + "`n" + $insertBlock + "`n")
          Write-Host "[2/3] 已向 cordis.patch.yml 追加插件条目（legacy）"
        }
      }
      Write-Host "[3/3] 跳过 profile bundle 登记（legacy 模式）"
    } else {
      if (Add-ProfileBundle) {
        Write-Host "[2/3] 已登记为 profile bundle，并写入 file: 依赖"
      } else {
        Write-Host "[2/3] ! profile package.json 登记失败（请检查上面的提示）"
      }
      if (Test-Path $yml) {
        $s = Read-Text $yml
        $cleaned = Remove-LegacyInsert $s
        if ($cleaned -ne $s) { $s = Normalize-Yml $cleaned; Write-Host "      已清除旧版本遗留的 insert 段" }
        $s = Set-DisableRow $s $false
        Write-Text $yml (Normalize-Yml $s)
        Write-Host "[3/3] 已在 cordis.patch.yml 标记 disabled: false"
      } else {
        Write-Host "[3/3] profile 无 cordis.patch.yml（插件自带 patch 已足够）"
      }
    }

    Write-Host ""
    Write-Host "完成！重启 dsh（Ctrl+C 停止后重新运行 dsh web），然后强制刷新浏览器（Ctrl+Shift+R）。"
  }
  "enable" {
    if (-not (Test-Path $yml)) { Write-Host "未找到 cordis.patch.yml，插件可能未安装"; return }
    $s = Read-Text $yml
    if (-not (Has-LoaderEntry $s) -and -not (Test-Path $profilePkg)) { Write-Host "未安装插件，请先运行 .\manage.ps1 install"; return }
    Write-Text $yml (Normalize-Yml (Set-DisableRow $s $false))
    Write-Host "已启用插件（disabled: false）。重启 dsh 生效。"
  }
  "disable" {
    if (-not (Test-Path $yml)) { Write-Host "未找到 cordis.patch.yml，插件可能未安装"; return }
    $s = Read-Text $yml
    Write-Text $yml (Normalize-Yml (Set-DisableRow $s $true))
    Write-Host "已停用插件（disabled: true）。重启 dsh 生效。"
  }
  "uninstall" {
    $did = $false
    if (-not $Legacy) {
      if (Remove-ProfileBundle) { Write-Host "[1/3] 已移除 profile bundle 登记与依赖"; $did = $true }
      else { Write-Host "[1/3] profile 中无插件登记（跳过）" }
    } else {
      Write-Host "[1/3] legacy 模式：跳过 bundle 登记移除"
    }
    if (Test-Path $yml) {
      $s = Read-Text $yml
      $cleaned = Remove-LegacyInsert $s
      $cleaned = [regex]::Replace($cleaned, "(?m)^- id:\s*'?$([regex]::Escape($pluginName))'?\s*\r?\n\s+disabled:\s*(true|false)[^\r\n]*\r?\n?", "")
      $cleaned = Normalize-Yml $cleaned
      Write-Text $yml $cleaned
      Write-Host "[2/3] 已清理 profile cordis.patch.yml 中的插件条目"
    } else {
      Write-Host "[2/3] 无 cordis.patch.yml（跳过）"
    }
    if (Test-Path $target) {
      Remove-Item $target -Recurse -Force
      Write-Host "[3/3] 已删除插件目录: $target"
    } else {
      Write-Host "[3/3] 插件目录不存在（跳过）"
    }
    Write-Host ""
    Write-Host "卸载完成。重启 dsh 生效。"
  }
  "status" {
    Write-Host "插件目录   : $(if (Test-Path $target) { '已安装' } else { '未安装' })"
    $registered = $false
    if (Test-Path $profilePkg) {
      $pkg = Read-ProfilePkg
      $b = @(Get-BundleList $pkg)
      $registered = $b -contains $pluginName
    }
    if (-not $Legacy) {
      Write-Host "profile 登记: $(if ($registered) { '已登记为 bundle' } else { '未登记' })"
    }
    if (Test-Path $yml) {
      $s = Read-Text $yml
      if (Has-DisableRow $s) { Write-Host "Loader 状态: 已停用（disabled: true）" }
      elseif (Has-EnableRow $s) { Write-Host "Loader 状态: 启用中（disabled: false）" }
      elseif (Has-LoaderEntry $s) { Write-Host "Loader 状态: 已注册（无 disabled 标记）" }
      else { Write-Host "Loader 状态: 未注册" }
    } else {
      Write-Host "Loader 状态: 无 cordis.patch.yml"
    }
    $settings = Join-Path $DshHome "settings.yaml"
    if (Test-Path $settings) {
      $match = Select-String -Path $settings -Pattern "arknights-theme" -SimpleMatch | Select-Object -First 1
      Write-Host "主题设置   : $(if ($match) { 'settings.yaml 中有 arknights-theme 节' } else { 'settings.yaml 中无 arknights-theme 节（默认 on）' })"
    }
  }
}
