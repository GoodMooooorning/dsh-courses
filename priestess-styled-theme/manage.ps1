# ==========================================================================
# 普瑞塞斯 · 源石协议 — Arknights theme plugin manager
#
#   manage.ps1 install    安装并启用插件（需重启 dsh 生效）
#   manage.ps1 enable     重新启用（移除 disabled）
#   manage.ps1 disable    停用插件（保留安装，重启生效）
#   manage.ps1 uninstall  卸载插件并还原配置（重启生效）
#   manage.ps1 status     查看插件状态
#
# 说明：所有操作都会提示是否需要重启 dsh（loader 在启动时扫描插件）。
# ==========================================================================
param(
  [ValidateSet("install", "enable", "disable", "uninstall", "status")]
  [string]$Action = "install"
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" }
$pluginName = "priestess-styled-theme"
$target = Join-Path $dshHome "profiles\node_modules\$pluginName"
$yml = Join-Path $dshHome "profiles\web\cordis.patch.yml"
$utf8 = New-Object System.Text.UTF8Encoding($false)

$insertBlock = @"
- insert:
    - id: arknights-theme
      name: 'priestess-styled-theme'
"@
$disabledLine = "      disabled: true"

function Read-Yml { [System.IO.File]::ReadAllText($yml, $utf8) }
function Write-Yml([string]$s) { [System.IO.File]::WriteAllText($yml, $s, $utf8) }
function Has-Entry([string]$s) { $s -match "(?m)^\s+name: 'priestess-styled-theme'\s*$" }
function Has-Disabled([string]$s) {
  $s -match "(?m)^\s+- id: arknights-theme\s*$\n\s+name: 'priestess-styled-theme'\s*$\n\s+disabled: true\s*$"
}
function Remove-EntryBlock([string]$s) {
  [regex]::Replace($s, "(?m)^- insert:\s*\n\s+- id: arknights-theme\s*\n\s+name: 'priestess-styled-theme'(\s*\n\s+disabled: true)?\s*", "")
}
function Restore-Empty([string]$s) {
  # 如果移除条目后只剩注释/空白，还原为原始空数组形态
  $body = ($s -replace "(?m)^#.*$", "").Trim()
  if ($body -eq "" -or $body -eq "[]") {
    return "[]`n"
  }
  return $s
}

Write-Host "=== 普瑞塞斯 · 源石协议 插件管理 ==="
switch ($Action) {
  "install" {
    if (-not (Test-Path $target)) {
      Copy-Item $repoRoot $target -Recurse -Force
      Write-Host "[1/2] 插件已复制到 profile: $target"
    } else {
      Copy-Item (Join-Path $repoRoot "*") $target -Recurse -Force
      Write-Host "[1/2] 插件已更新: $target"
    }
    if (-not (Test-Path $yml)) {
      Write-Yml ($insertBlock + "`n")
      Write-Host "[2/2] 已创建 cordis.patch.yml 并启用插件"
    } else {
      $s = Read-Yml
      if (Has-Entry $s) {
        Write-Host "[2/2] 插件已在配置中启用（幂等，无需改动）"
      } elseif ($s -match "(?m)^\[\s*\]\s*$") {
        Write-Yml ($s -replace "(?m)^\[\s*\]\s*$", ($insertBlock + "`n"))
        Write-Host "[2/2] 已在 cordis.patch.yml 启用插件（替换空数组）"
      } else {
        Write-Yml ($s.TrimEnd() + "`n" + $insertBlock + "`n")
        Write-Host "[2/2] 已向 cordis.patch.yml 追加插件条目"
      }
    }
    Write-Host "`n完成！请重启 dsh（Ctrl+C 停止后重新运行 dsh web），然后刷新浏览器。"
    Write-Host "默认只在名为 betterui 的工作区生效；在其他工作区启用："
    Write-Host "  访问 http://127.0.0.1:3080/?aktarget=你的工作区名"
  }
  "enable" {
    if (-not (Test-Path $yml)) { Write-Host "未找到 cordis.patch.yml，插件未安装"; return }
    $s = Read-Yml
    if (-not (Has-Entry $s)) { Write-Host "配置中无插件条目，请先运行 manage.ps1 install"; return }
    if (Has-Disabled $s) {
      $s = [regex]::Replace($s, "(?m)^(\s+- id: arknights-theme\s*$\n\s+name: 'priestess-styled-theme'\s*$\n)\s+disabled: true\s*$", "`$1")
      Write-Yml $s
      Write-Host "已重新启用插件（移除 disabled）。请重启 dsh 生效。"
    } else {
      Write-Host "插件已是启用状态。"
    }
  }
  "disable" {
    if (-not (Test-Path $yml)) { Write-Host "未找到 cordis.patch.yml，插件未安装"; return }
    $s = Read-Yml
    if (-not (Has-Entry $s)) { Write-Host "配置中无插件条目"; return }
    if (-not (Has-Disabled $s)) {
      $s = [regex]::Replace($s, "(?m)^(\s+- id: arknights-theme\s*$\n\s+name: 'priestess-styled-theme'\s*$)", "`$1`n$disabledLine")
      Write-Yml $s
      Write-Host "已停用插件（标记 disabled）。请重启 dsh 生效。"
    } else {
      Write-Host "插件已是停用状态。"
    }
  }
  "uninstall" {
    if (Test-Path $yml) {
      $s = Read-Yml
      if (Has-Entry $s) {
        $s = Remove-EntryBlock $s
        $s = Restore-Empty $s
        Write-Yml $s
        Write-Host "[1/2] 已从 cordis.patch.yml 移除插件条目"
      } else {
        Write-Host "[1/2] 配置中无插件条目（跳过）"
      }
    }
    if (Test-Path $target) {
      Remove-Item $target -Recurse -Force
      Write-Host "[2/2] 已删除插件目录: $target"
    } else {
      Write-Host "[2/2] 插件目录不存在（跳过）"
    }
    Write-Host "`n卸载完成。请重启 dsh 生效。"
  }
  "status" {
    Write-Host "插件目录: $(if (Test-Path $target) { '已安装' } else { '未安装' })"
    if (Test-Path $yml) {
      $s = Read-Yml
      if (Has-Entry $s) {
        Write-Host "配置: 已注册 $(if (Has-Disabled $s) { '(已停用 disabled)' } else { '(启用中)' })"
      } else {
        Write-Host "配置: 未注册"
      }
    } else {
      Write-Host "配置: 无 cordis.patch.yml"
    }
    $dist = Join-Path $dshHome "profiles\node_modules\@deepseek-ai\dsh-web-frontend\dist"
    $legacy = Join-Path $dist "assets\arknights"
    if (Test-Path $legacy) { Write-Host "旧版 dist 注入残留: 存在（可忽略，或删除 assets\arknights 目录）" }
  }
}
