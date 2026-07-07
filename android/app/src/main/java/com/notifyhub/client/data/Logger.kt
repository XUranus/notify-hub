package com.notifyhub.client.data

import android.content.Context
import android.util.Log

object AppLogger {
    const val DEBUG = 0
    const val INFO = 1
    const val WARN = 2
    const val ERROR = 3

    private var enabled = true
    private var level = INFO

    fun init(context: Context) {
        enabled = ConfigStore.isLogEnabled(context)
        level = ConfigStore.getLogLevel(context)
    }

    fun refresh(context: Context) {
        enabled = ConfigStore.isLogEnabled(context)
        level = ConfigStore.getLogLevel(context)
    }

    fun d(tag: String, msg: String) {
        if (enabled && level <= DEBUG) Log.d(tag, msg)
    }

    fun i(tag: String, msg: String) {
        if (enabled && level <= INFO) Log.i(tag, msg)
    }

    fun w(tag: String, msg: String) {
        if (enabled && level <= WARN) Log.w(tag, msg)
    }

    fun e(tag: String, msg: String, tr: Throwable? = null) {
        if (enabled && level <= ERROR) {
            if (tr != null) Log.e(tag, msg, tr) else Log.e(tag, msg)
        }
    }
}
