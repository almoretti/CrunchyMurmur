import AppKit
import CoreGraphics
import EventKit
import Foundation

func writeLine(_ value: String) {
    FileHandle.standardOutput.write((value + "\n").data(using: .utf8)!)
}

func runFnMonitor() -> Never {
    _ = CGRequestListenEventAccess()
    let fnDown = UnsafeMutablePointer<Bool>.allocate(capacity: 1)
    fnDown.initialize(to: false)
    let mask = CGEventMask(1 << CGEventType.flagsChanged.rawValue)
    let callback: CGEventTapCallBack = { _, type, event, userInfo in
        guard type == .flagsChanged, let userInfo else { return Unmanaged.passUnretained(event) }
        let state = userInfo.assumingMemoryBound(to: Bool.self)
        let next = event.flags.contains(.maskSecondaryFn)
        if next != state.pointee {
            state.pointee = next
            writeLine(next ? "DOWN" : "UP")
        }
        return Unmanaged.passUnretained(event)
    }
    guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap,
                                      place: .headInsertEventTap,
                                      options: .listenOnly,
                                      eventsOfInterest: mask,
                                      callback: callback,
                                      userInfo: UnsafeMutableRawPointer(fnDown)) else {
        FileHandle.standardError.write("Unable to create Fn event tap. Grant Accessibility and Input Monitoring.\n".data(using: .utf8)!)
        exit(2)
    }
    let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    writeLine("READY")
    CFRunLoopRun()
    fatalError("Run loop exited")
}

struct CalendarRow: Codable {
    let id: String
    let title: String
    let start: String
    let end: String
    let location: String?
    let calendar: String
    let isAllDay: Bool
}

@available(macOS 14.0, *)
func requestCalendarAccess(_ store: EKEventStore) async throws -> Bool {
    try await store.requestFullAccessToEvents()
}

func legacyCalendarAccess(_ store: EKEventStore) async throws -> Bool {
    try await withCheckedThrowingContinuation { continuation in
        store.requestAccess(to: .event) { granted, error in
            if let error { continuation.resume(throwing: error) }
            else { continuation.resume(returning: granted) }
        }
    }
}

func runCalendar() async {
    let store = EKEventStore()
    do {
        let granted: Bool
        if #available(macOS 14.0, *) { granted = try await requestCalendarAccess(store) }
        else { granted = try await legacyCalendarAccess(store) }
        guard granted else {
            FileHandle.standardError.write("Calendar access was not granted.\n".data(using: .utf8)!)
            exit(3)
        }
        let start = Calendar.current.startOfDay(for: Date())
        let end = Calendar.current.date(byAdding: .day, value: 2, to: start)!
        let events = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil))
        let iso = ISO8601DateFormatter()
        let rows = events.map { event in
            CalendarRow(id: event.eventIdentifier ?? UUID().uuidString,
                        title: event.title ?? "Untitled event",
                        start: iso.string(from: event.startDate),
                        end: iso.string(from: event.endDate),
                        location: event.location,
                        calendar: event.calendar.title,
                        isAllDay: event.isAllDay)
        }
        let data = try JSONEncoder().encode(rows)
        FileHandle.standardOutput.write(data)
    } catch {
        FileHandle.standardError.write((error.localizedDescription + "\n").data(using: .utf8)!)
        exit(4)
    }
}

func runPermissionStatus() throws {
    let rawCalendar = EKEventStore.authorizationStatus(for: .event).rawValue
    let calendarStatus: String
    switch rawCalendar {
    case 0: calendarStatus = "not-determined"
    case 1: calendarStatus = "restricted"
    case 2: calendarStatus = "denied"
    case 3, 4: calendarStatus = "granted"
    case 5: calendarStatus = "write-only"
    default: calendarStatus = "unknown"
    }
    let payload: [String: Any] = [
        "inputMonitoring": CGPreflightListenEventAccess() ? "granted" : "denied",
        "calendar": calendarStatus,
    ]
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: payload))
}

@main
struct CrunchyMurmurNative {
    static func main() async {
        switch CommandLine.arguments.dropFirst().first {
        case "fn": runFnMonitor()
        case "calendar": await runCalendar()
        case "permission-status": try? runPermissionStatus()
        default:
            FileHandle.standardError.write("Usage: CrunchyMurmurNative fn|calendar\n".data(using: .utf8)!)
            exit(1)
        }
    }
}
