import Foundation

@MainActor
final class IntelligenceStore: ObservableObject {
    @Published private(set) var todayBrief: NomiDailyBrief?
    @Published private(set) var projects: [NomiProject] = []
    @Published private(set) var isLoadingBrief = false
    @Published private(set) var isLoadingProjects = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let backendService = XBackendService()

    func loadTodayBrief(forceRegenerate: Bool = false) async {
        isLoadingBrief = true
        errorMessage = nil
        defer { isLoadingBrief = false }

        do {
            todayBrief = forceRegenerate
                ? try await backendService.generateTodayBrief(force: true)
                : try await backendService.todayBrief()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadProjects(includeArchived: Bool = false) async {
        isLoadingProjects = true
        defer { isLoadingProjects = false }

        do {
            projects = try await backendService.listProjects(includeArchived: includeArchived)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createProject(name: String, description: String?, tags: [String], concepts: [String]) async -> Bool {
        do {
            let project = try await backendService.createProject(name: name, description: description, tags: tags, concepts: concepts)
            projects.insert(project, at: 0)
            successMessage = "Project created."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func updateProject(_ project: NomiProject, name: String?, description: String?, status: String?, tags: [String]?, concepts: [String]?) async -> Bool {
        do {
            let updated = try await backendService.updateProject(project, name: name, description: description, status: status, tags: tags, concepts: concepts)
            replace(updated)
            successMessage = "Project updated."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func archiveProject(_ project: NomiProject) async -> Bool {
        do {
            let updated = try await backendService.archiveProject(project)
            replace(updated)
            projects.removeAll { $0.id == updated.id && updated.status == "archived" }
            successMessage = "Project archived."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func assign(memoryId: String, to project: NomiProject) async -> Bool {
        do {
            try await backendService.assignMemory(memoryId: memoryId, to: project)
            await loadProjects()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func assign(memory: NomiMemory, to project: NomiProject) async -> Bool {
        do {
            try await backendService.assignMemory(memoryId: memory.id, to: project)
            await loadProjects()
            successMessage = "Memory added to \(project.name)."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func remove(memory: NomiMemory, from project: NomiProject) async -> Bool {
        do {
            try await backendService.removeMemory(memoryId: memory.id, from: project)
            await loadProjects()
            successMessage = "Memory removed from \(project.name)."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func generateSummary(for project: NomiProject, forceRegenerate: Bool = false) async -> NomiProject? {
        do {
            let updated = try await backendService.generateProjectSummary(projectId: project.id, forceRegenerate: forceRegenerate)
            replace(updated)
            return updated
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    private func replace(_ project: NomiProject) {
        if let index = projects.firstIndex(where: { $0.id == project.id }) {
            projects[index] = project
        } else {
            projects.insert(project, at: 0)
        }
    }
}
