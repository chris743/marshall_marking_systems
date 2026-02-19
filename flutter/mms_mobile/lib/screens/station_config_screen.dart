import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import '../models/labeling_group.dart';
import '../models/printer.dart';
import '../models/product.dart';
import '../services/api_service.dart';
import '../widgets/product_search.dart';

class StationConfigScreen extends StatefulWidget {
  const StationConfigScreen({super.key});

  @override
  State<StationConfigScreen> createState() => _StationConfigScreenState();
}

class _StationConfigScreenState extends State<StationConfigScreen> {
  List<LabelingGroup> _groups = [];
  List<LocationCode> _locationCodes = [];
  List<Printer> _printers = [];
  bool _loading = true;
  String? _error;

  // Expanded groups
  final Map<String, bool> _expandedGroups = {};
  // Configs per group
  final Map<String, List<GroupConfig>> _groupConfigs = {};

  // Selected state
  LabelingGroup? _selectedGroup;
  List<GroupScanner> _groupScanners = [];
  GroupConfig? _selectedConfig;

  ApiService get _api => context.read<AppProvider>().api;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _api.getGroups(),
        _api.getLocationCodes(),
        _api.getPrinters(),
      ]);
      setState(() {
        _groups = results[0] as List<LabelingGroup>;
        _locationCodes = results[1] as List<LocationCode>;
        _printers = results[2] as List<Printer>;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadGroupConfigs(String groupId) async {
    try {
      final configs = await _api.getGroupConfigs(groupId);
      setState(() {
        _groupConfigs[groupId] = configs;
      });
    } catch (_) {}
  }

  Future<void> _loadGroupScanners(String groupId) async {
    try {
      final scanners = await _api.getGroupScanners(groupId);
      setState(() {
        _groupScanners = scanners;
      });
    } catch (_) {
      setState(() {
        _groupScanners = [];
      });
    }
  }

  void _toggleGroup(String groupId) {
    setState(() {
      _expandedGroups[groupId] = !(_expandedGroups[groupId] ?? false);
    });
    if (_expandedGroups[groupId] == true) {
      _loadGroupConfigs(groupId);
    }
  }

  void _selectGroup(LabelingGroup group) {
    setState(() {
      _selectedGroup = group;
      _selectedConfig = null;
    });
    _loadGroupScanners(group.id);
    _showGroupDetail(group);
  }

  void _selectCode(LabelingGroup group, GroupConfig config) {
    setState(() {
      _selectedGroup = group;
      _selectedConfig = config;
    });
    _showCodeConfig(group, config);
  }

  void _showSnack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
      ),
    );
  }

  // ============ GROUP CRUD ============

  Future<void> _showAddGroupDialog() async {
    final nameController = TextEditingController();
    final descController = TextEditingController();
    String? selectedPrinterId;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Add Group'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Name',
                    hintText: 'e.g., Line 1 Config',
                  ),
                  autofocus: true,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descController,
                  decoration: const InputDecoration(
                    labelText: 'Description (optional)',
                  ),
                  maxLines: 2,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedPrinterId,
                  decoration: const InputDecoration(labelText: 'Printer'),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('None')),
                    ..._printers.map((p) => DropdownMenuItem(
                          value: p.id,
                          child: Text(p.name),
                        )),
                  ],
                  onChanged: (v) => setDialogState(() => selectedPrinterId = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: nameController.text.trim().isEmpty ? null : () => Navigator.pop(ctx, true),
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );

    if (result == true && nameController.text.trim().isNotEmpty) {
      try {
        final group = await _api.createGroup(
          name: nameController.text.trim(),
          description: descController.text.trim().isEmpty ? null : descController.text.trim(),
          printerId: selectedPrinterId,
        );
        _showSnack('Group created');
        await _loadData();
        setState(() {
          _expandedGroups[group.id] = true;
        });
      } catch (e) {
        _showSnack(e.toString(), isError: true);
      }
    }

    nameController.dispose();
    descController.dispose();
  }

  Future<void> _showEditGroupDialog(LabelingGroup group) async {
    final nameController = TextEditingController(text: group.name);
    final descController = TextEditingController(text: group.description ?? '');
    String? selectedPrinterId = group.printerId;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Edit Group'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(labelText: 'Name'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descController,
                  decoration: const InputDecoration(labelText: 'Description'),
                  maxLines: 2,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedPrinterId,
                  decoration: const InputDecoration(labelText: 'Printer'),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('None')),
                    ..._printers.map((p) => DropdownMenuItem(
                          value: p.id,
                          child: Text(p.name),
                        )),
                  ],
                  onChanged: (v) => setDialogState(() => selectedPrinterId = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Update'),
            ),
          ],
        ),
      ),
    );

    if (result == true) {
      try {
        await _api.updateGroup(
          group.id,
          name: nameController.text.trim(),
          description: descController.text.trim().isEmpty ? null : descController.text.trim(),
          enabled: group.enabled,
          printerId: selectedPrinterId,
        );
        _showSnack('Group updated');
        await _loadData();
      } catch (e) {
        _showSnack(e.toString(), isError: true);
      }
    }

    nameController.dispose();
    descController.dispose();
  }

  Future<void> _deleteGroup(LabelingGroup group) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Group'),
        content: Text('Delete "${group.name}" and all its configs?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await _api.deleteGroup(group.id);
        _showSnack('Group deleted');
        setState(() {
          _selectedGroup = null;
          _selectedConfig = null;
        });
        await _loadData();
      } catch (e) {
        _showSnack(e.toString(), isError: true);
      }
    }
  }

  Future<void> _toggleGroupEnabled(LabelingGroup group) async {
    try {
      await _api.updateGroup(
        group.id,
        name: group.name,
        description: group.description,
        enabled: !group.enabled,
        printerId: group.printerId,
      );
      await _loadData();
    } catch (e) {
      _showSnack(e.toString(), isError: true);
    }
  }

  Future<void> _changePrinter(LabelingGroup group, String? printerId) async {
    try {
      await _api.updateGroup(
        group.id,
        name: group.name,
        description: group.description,
        enabled: group.enabled,
        printerId: printerId,
      );
      await _loadData();
    } catch (e) {
      _showSnack(e.toString(), isError: true);
    }
  }

  // ============ ADD CODE ============

  Future<void> _showAddCodeDialog(String groupId) async {
    LocationCode? selectedCode;
    final codeController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Add Location Code'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Autocomplete<LocationCode>(
                optionsBuilder: (textEditingValue) {
                  if (textEditingValue.text.isEmpty) return _locationCodes;
                  return _locationCodes.where((c) =>
                      c.code.toLowerCase().contains(textEditingValue.text.toLowerCase()));
                },
                displayStringForOption: (code) => code.code,
                fieldViewBuilder: (ctx, controller, focusNode, onSubmitted) {
                  codeController.text = controller.text;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: const InputDecoration(
                      labelText: 'Location Code',
                      hintText: 'Select or type a new code',
                    ),
                    textCapitalization: TextCapitalization.characters,
                    onChanged: (v) {
                      codeController.text = v.toUpperCase();
                      setDialogState(() => selectedCode = null);
                    },
                  );
                },
                onSelected: (code) {
                  setDialogState(() => selectedCode = code);
                  codeController.text = code.code;
                },
              ),
              if (codeController.text.isNotEmpty &&
                  selectedCode == null &&
                  !_locationCodes.any((c) => c.code == codeController.text.toUpperCase()))
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '"${codeController.text.toUpperCase()}" will be created as a new code',
                    style: Theme.of(ctx).textTheme.bodySmall?.copyWith(color: Colors.grey),
                  ),
                ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
          ],
        ),
      ),
    );

    if (result != true) return;

    String? codeId = selectedCode?.id;

    // Create new code if needed
    if (codeId == null && codeController.text.trim().isNotEmpty) {
      try {
        final newCode = await _api.createLocationCode(
          code: codeController.text.trim().toUpperCase(),
        );
        codeId = newCode.id;
        // Refresh location codes
        final codes = await _api.getLocationCodes();
        setState(() => _locationCodes = codes);
      } catch (e) {
        _showSnack(e.toString(), isError: true);
        codeController.dispose();
        return;
      }
    }

    if (codeId == null) {
      codeController.dispose();
      return;
    }

    // Create blank config for this code in the group
    try {
      await _api.saveGroupConfig({
        'group_id': groupId,
        'location_code_id': codeId,
      });
      _showSnack('Code added to group');
      await _loadGroupConfigs(groupId);
      await _loadData();
    } catch (e) {
      _showSnack(e.toString(), isError: true);
    }

    codeController.dispose();
  }

  Future<void> _deleteCodeFromGroup(GroupConfig config, String groupId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Code'),
        content: Text('Remove "${config.locationCode}" config from this group?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await _api.deleteGroupConfig(config.id);
        _showSnack('Code removed');
        if (_selectedConfig?.id == config.id) {
          setState(() => _selectedConfig = null);
        }
        await _loadGroupConfigs(groupId);
        await _loadData();
      } catch (e) {
        _showSnack(e.toString(), isError: true);
      }
    }
  }

  // ============ SCANNER ASSIGNMENT ============

  Future<void> _showAssignScannerDialog() async {
    if (_selectedGroup == null) return;

    List<GroupScanner> allScanners = [];
    try {
      final scanners = await _api.getScanners();
      allScanners = scanners
          .map((s) => GroupScanner(
                id: s.id,
                name: s.name,
                connectionString: s.ipAddress,
              ))
          .toList();
    } catch (_) {}

    final assignedIds = _groupScanners.map((s) => s.id).toSet();

    if (!mounted) return;

    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Assign Scanner'),
        content: SizedBox(
          width: double.maxFinite,
          child: allScanners.isEmpty
              ? const Text('No scanners available. Create scanners first.')
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: allScanners.length,
                  itemBuilder: (ctx, index) {
                    final scanner = allScanners[index];
                    final isAssigned = assignedIds.contains(scanner.id);
                    return ListTile(
                      leading: Icon(
                        Icons.scanner,
                        color: isAssigned ? Colors.grey : Theme.of(ctx).colorScheme.primary,
                      ),
                      title: Text(scanner.name),
                      subtitle: scanner.connectionString != null
                          ? Text(scanner.connectionString!)
                          : null,
                      trailing: isAssigned
                          ? const Chip(label: Text('Assigned'))
                          : null,
                      enabled: !isAssigned,
                      onTap: isAssigned
                          ? null
                          : () async {
                              try {
                                await _api.assignScanner(
                                    _selectedGroup!.id, scanner.id);
                                _showSnack('Scanner assigned');
                                await _loadGroupScanners(_selectedGroup!.id);
                                await _loadData();
                                if (ctx.mounted) Navigator.pop(ctx);
                              } catch (e) {
                                _showSnack(e.toString(), isError: true);
                              }
                            },
                    );
                  },
                ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ),
    );
  }

  Future<void> _unassignScanner(String scannerId) async {
    if (_selectedGroup == null) return;
    try {
      await _api.unassignScanner(_selectedGroup!.id, scannerId);
      _showSnack('Scanner removed');
      await _loadGroupScanners(_selectedGroup!.id);
      await _loadData();
    } catch (e) {
      _showSnack(e.toString(), isError: true);
    }
  }

  // ============ GROUP DETAIL BOTTOM SHEET ============

  void _showGroupDetail(LabelingGroup group) {
    _loadGroupScanners(group.id);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          // Re-read from parent state
          final currentGroup = _groups.firstWhere(
            (g) => g.id == group.id,
            orElse: () => group,
          );

          return DraggableScrollableSheet(
            initialChildSize: 0.7,
            minChildSize: 0.4,
            maxChildSize: 0.95,
            expand: false,
            builder: (ctx, scrollController) => Padding(
              padding: const EdgeInsets.all(16),
              child: ListView(
                controller: scrollController,
                children: [
                  // Header
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          currentGroup.name,
                          style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                      ),
                      Switch(
                        value: currentGroup.enabled,
                        onChanged: (_) async {
                          await _toggleGroupEnabled(currentGroup);
                          setSheetState(() {});
                        },
                      ),
                      IconButton(
                        icon: const Icon(Icons.edit),
                        onPressed: () async {
                          Navigator.pop(ctx);
                          await _showEditGroupDialog(currentGroup);
                        },
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete, color: Colors.red),
                        onPressed: () async {
                          Navigator.pop(ctx);
                          await _deleteGroup(currentGroup);
                        },
                      ),
                    ],
                  ),
                  if (currentGroup.description != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      currentGroup.description!,
                      style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(color: Colors.grey),
                    ),
                  ],
                  const SizedBox(height: 16),

                  // Printer
                  Text('Printer', style: Theme.of(ctx).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: currentGroup.printerId,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('None')),
                      ..._printers.map((p) => DropdownMenuItem(
                            value: p.id,
                            child: Row(
                              children: [
                                Icon(Icons.print, size: 16,
                                    color: p.isOnline ? Colors.green : Colors.red),
                                const SizedBox(width: 8),
                                Expanded(child: Text(p.name, overflow: TextOverflow.ellipsis)),
                              ],
                            ),
                          )),
                    ],
                    onChanged: (v) async {
                      await _changePrinter(currentGroup, v);
                      setSheetState(() {});
                    },
                  ),
                  const SizedBox(height: 20),

                  // Assigned Scanners
                  Row(
                    children: [
                      const Icon(Icons.scanner, size: 18),
                      const SizedBox(width: 6),
                      Text('Assigned Scanners (${_groupScanners.length})',
                          style: Theme.of(ctx).textTheme.titleSmall),
                      const Spacer(),
                      TextButton.icon(
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Assign'),
                        onPressed: () async {
                          Navigator.pop(ctx);
                          await _showAssignScannerDialog();
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_groupScanners.isEmpty)
                    Text(
                      'No scanners assigned',
                      style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                            fontStyle: FontStyle.italic,
                            color: Colors.grey,
                          ),
                    )
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: _groupScanners.map((scanner) {
                        return Chip(
                          avatar: const Icon(Icons.scanner, size: 16),
                          label: Text(scanner.name),
                          onDeleted: () async {
                            await _unassignScanner(scanner.id);
                            setSheetState(() {});
                          },
                          deleteIconColor: Colors.red,
                        );
                      }).toList(),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ============ CODE CONFIG BOTTOM SHEET ============

  void _showCodeConfig(LabelingGroup group, GroupConfig config) {
    String? templateId = config.templateId;
    Product? product = config.productId != null
        ? Product(
            id: config.productId!,
            description: config.productDescription ?? '',
            gtin: config.gtin ?? '',
            companyName: config.companyName,
            commodity: config.commodity,
            rawData: {
              'id': config.productId,
              'description': config.productDescription,
              'gtin': config.gtin,
              'company_name': config.companyName,
              'company_prefix': config.companyPrefix,
              'item_reference': config.itemReference,
              'indicator_digit': config.indicatorDigit,
              'commodity': config.commodity,
              'style': config.style,
            },
          )
        : null;
    int copies = config.copies;
    String lotNumber = config.lotNumber ?? '';
    String packDateFormat = config.packDateFormat ?? 'YYMMDD';
    int packDateOffset = config.packDateOffset;
    Map<String, dynamic> variableValues = Map.from(config.variableValues);

    final lotController = TextEditingController(text: lotNumber);
    final offsetController = TextEditingController(text: packDateOffset.toString());

    final provider = context.read<AppProvider>();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          return DraggableScrollableSheet(
            initialChildSize: 0.85,
            minChildSize: 0.5,
            maxChildSize: 0.95,
            expand: false,
            builder: (ctx, scrollController) => Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: ListView(
                controller: scrollController,
                children: [
                  // Header
                  Row(
                    children: [
                      const Icon(Icons.qr_code, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        'Code: ',
                        style: Theme.of(ctx).textTheme.titleMedium,
                      ),
                      Text(
                        config.locationCode ?? '',
                        style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              fontFamily: 'monospace',
                            ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Group: ${group.name}',
                    style: Theme.of(ctx).textTheme.bodySmall?.copyWith(color: Colors.grey),
                  ),
                  const Divider(height: 24),

                  // Template
                  Text('Template', style: Theme.of(ctx).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: templateId,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      isDense: true,
                      hintText: 'Select template',
                    ),
                    isExpanded: true,
                    items: [
                      const DropdownMenuItem(value: null, child: Text('None')),
                      ...provider.templates.map((t) => DropdownMenuItem(
                            value: t.id,
                            child: Text(t.name, overflow: TextOverflow.ellipsis),
                          )),
                    ],
                    onChanged: (v) => setSheetState(() => templateId = v),
                  ),
                  const SizedBox(height: 16),

                  // Product
                  Text('Product', style: Theme.of(ctx).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  ProductSearch(
                    selectedProduct: product,
                    onProductSelected: (p) => setSheetState(() => product = p),
                  ),
                  if (product != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Theme.of(ctx).colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(product!.description,
                              style: const TextStyle(fontWeight: FontWeight.bold)),
                          Text('GTIN: ${product!.gtin}',
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),

                  // Copies
                  Text('Copies', style: Theme.of(ctx).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.remove),
                        onPressed: copies > 1
                            ? () => setSheetState(() => copies--)
                            : null,
                      ),
                      Text('$copies', style: Theme.of(ctx).textTheme.titleLarge),
                      IconButton(
                        icon: const Icon(Icons.add),
                        onPressed: () => setSheetState(() => copies++),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Lot Number
                  Text('Lot Number', style: Theme.of(ctx).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  TextField(
                    controller: lotController,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    textCapitalization: TextCapitalization.characters,
                    onChanged: (v) => lotNumber = v.toUpperCase(),
                  ),
                  const SizedBox(height: 16),

                  // Date Format & Offset
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Date Format', style: Theme.of(ctx).textTheme.titleSmall),
                            const SizedBox(height: 8),
                            DropdownButtonFormField<String>(
                              initialValue: packDateFormat,
                              decoration: const InputDecoration(
                                border: OutlineInputBorder(),
                                isDense: true,
                              ),
                              items: const [
                                DropdownMenuItem(value: 'YYMMDD', child: Text('YYMMDD')),
                                DropdownMenuItem(value: 'MMDDYY', child: Text('MMDDYY')),
                                DropdownMenuItem(value: 'MMMDDYY', child: Text('MMMDDYY')),
                                DropdownMenuItem(value: 'MM/DD/YY', child: Text('MM/DD/YY')),
                                DropdownMenuItem(value: 'YYDDD', child: Text('YYDDD (Julian)')),
                                DropdownMenuItem(value: 'YYYY-MM-DD', child: Text('YYYY-MM-DD')),
                              ],
                              onChanged: (v) {
                                if (v != null) setSheetState(() => packDateFormat = v);
                              },
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Offset', style: Theme.of(ctx).textTheme.titleSmall),
                            const SizedBox(height: 8),
                            TextField(
                              controller: offsetController,
                              decoration: const InputDecoration(
                                border: OutlineInputBorder(),
                                isDense: true,
                              ),
                              keyboardType: const TextInputType.numberWithOptions(signed: true),
                              onChanged: (v) => packDateOffset = int.tryParse(v) ?? 0,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Save Button
                  FilledButton.icon(
                    onPressed: () async {
                      try {
                        await _api.saveGroupConfig({
                          'group_id': group.id,
                          'location_code_id': config.locationCodeId,
                          'template_id': templateId,
                          'product_id': product?.id,
                          'copies': copies,
                          'lot_number': lotNumber,
                          'pack_date_format': packDateFormat,
                          'pack_date_offset': packDateOffset,
                          'variable_values': variableValues,
                        });
                        _showSnack('Config saved');
                        await _loadGroupConfigs(group.id);
                        if (ctx.mounted) Navigator.pop(ctx);
                      } catch (e) {
                        _showSnack(e.toString(), isError: true);
                      }
                    },
                    icon: const Icon(Icons.save),
                    label: const Text('Save Configuration'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    ).then((_) {
      lotController.dispose();
      offsetController.dispose();
    });
  }

  // ============ BUILD ============

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Station Configuration'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddGroupDialog,
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Colors.red),
                      const SizedBox(height: 16),
                      Text('Failed to load', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Text(_error!, style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _loadData, child: const Text('Retry')),
                    ],
                  ),
                )
              : _groups.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.settings, size: 64, color: Colors.grey[300]),
                          const SizedBox(height: 16),
                          Text('No groups configured',
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          const Text('Tap + to create your first group'),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.only(bottom: 80),
                      itemCount: _groups.length,
                      itemBuilder: (context, index) {
                        final group = _groups[index];
                        final isExpanded = _expandedGroups[group.id] ?? false;
                        final configs = _groupConfigs[group.id] ?? [];

                        return Card(
                          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          child: Column(
                            children: [
                              // Group header
                              ListTile(
                                leading: Icon(
                                  Icons.group_work,
                                  color: group.enabled
                                      ? Theme.of(context).colorScheme.primary
                                      : Colors.grey,
                                ),
                                title: Text(
                                  group.name,
                                  style: const TextStyle(fontWeight: FontWeight.bold),
                                ),
                                subtitle: Text(
                                  '${group.codeCount ?? 0} codes'
                                  '${group.scannerCount != null ? ' \u00b7 ${group.scannerCount} scanners' : ''}',
                                ),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.settings, size: 20),
                                      onPressed: () => _selectGroup(group),
                                      tooltip: 'Group settings',
                                    ),
                                    Icon(
                                      isExpanded ? Icons.expand_less : Icons.expand_more,
                                    ),
                                  ],
                                ),
                                onTap: () => _toggleGroup(group.id),
                              ),

                              // Expanded code list
                              if (isExpanded) ...[
                                const Divider(height: 1),

                                // Add code button
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                                  child: Align(
                                    alignment: Alignment.centerLeft,
                                    child: TextButton.icon(
                                      icon: const Icon(Icons.add, size: 16),
                                      label: const Text('Add Code'),
                                      style: TextButton.styleFrom(
                                        textStyle: const TextStyle(fontSize: 13),
                                        padding: EdgeInsets.zero,
                                        minimumSize: const Size(0, 32),
                                      ),
                                      onPressed: () => _showAddCodeDialog(group.id),
                                    ),
                                  ),
                                ),

                                // Code list
                                if (configs.isEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(left: 56, bottom: 12),
                                    child: Text(
                                      'No codes configured',
                                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                            fontStyle: FontStyle.italic,
                                            color: Colors.grey,
                                          ),
                                    ),
                                  )
                                else
                                  ...configs.map((config) => ListTile(
                                        contentPadding:
                                            const EdgeInsets.only(left: 56, right: 8),
                                        leading: Icon(
                                          Icons.qr_code,
                                          size: 18,
                                          color: config.templateId != null
                                              ? Theme.of(context).colorScheme.primary
                                              : Colors.grey,
                                        ),
                                        title: Text(
                                          config.locationCode ?? '',
                                          style: const TextStyle(
                                            fontFamily: 'monospace',
                                            fontSize: 14,
                                          ),
                                        ),
                                        subtitle: config.templateName != null
                                            ? Text(
                                                config.templateName!,
                                                style: const TextStyle(fontSize: 12),
                                              )
                                            : const Text(
                                                'Not configured',
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  fontStyle: FontStyle.italic,
                                                  color: Colors.grey,
                                                ),
                                              ),
                                        trailing: IconButton(
                                          icon: const Icon(Icons.close, size: 16),
                                          onPressed: () =>
                                              _deleteCodeFromGroup(config, group.id),
                                        ),
                                        onTap: () => _selectCode(group, config),
                                      )),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
    );
  }
}
