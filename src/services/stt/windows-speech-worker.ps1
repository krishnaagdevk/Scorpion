# Windows Native Background Speech Recognition Worker
# Uses System.Speech.Recognition (Built into Windows 11)
# No API keys required, runs in background without UI popups

param(
    [string]$Device = "default",
    [string]$Culture = "en-US"
)

$ErrorActionPreference = "Stop"

try {
    Add-Type -AssemblyName System.Speech

    $sre = $null
    $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
    foreach ($rec in $recognizers) {
        if ($rec.Culture.Name -eq $Culture) {
            $sre = New-Object System.Speech.Recognition.SpeechRecognitionEngine($rec)
            break
        }
    }

    if ($null -eq $sre) {
        $sre = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    }

    $sre.SetInputToDefaultAudioDevice()
    $grammar = New-Object System.Speech.Recognition.DictationGrammar
    $grammar.Name = "Dictation"
    $sre.LoadGrammar($grammar)

    # Event: Recognized (Final)
    $actionRecognized = {
        param($sender, $e)
        if ($e -and $e.Result -and $e.Result.Text) {
            $txt = $e.Result.Text.Trim()
            if ($txt.Length -gt 0) {
                [Console]::WriteLine("[FINAL] " + $txt)
            }
        }
    }
    Register-ObjectEvent -InputObject $sre -EventName "SpeechRecognized" -Action $actionRecognized | Out-Null

    # Event: Hypothesized (Partial / Interim)
    $actionHypothesized = {
        param($sender, $e)
        if ($e -and $e.Result -and $e.Result.Text) {
            $txt = $e.Result.Text.Trim()
            if ($txt.Length -gt 0) {
                [Console]::WriteLine("[PARTIAL] " + $txt)
            }
        }
    }
    Register-ObjectEvent -InputObject $sre -EventName "SpeechHypothesized" -Action $actionHypothesized | Out-Null

    # Start continuous asynchronous recognition
    $sre.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
    [Console]::WriteLine("[STATUS] ready")

    # Keep alive until EOF or STOP received on stdin
    while ($true) {
        $line = [Console]::ReadLine()
        if ($null -eq $line -or $line.Trim() -eq "STOP") {
            break
        }
    }
}
catch {
    [Console]::Error.WriteLine("[ERROR] " + $_.Exception.Message)
}
finally {
    if ($null -ne $sre) {
        try {
            $sre.RecognizeAsyncCancel()
            $sre.Dispose()
        } catch {}
    }
    [Console]::WriteLine("[STATUS] stopped")
}
