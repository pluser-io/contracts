// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/metatx/MinimalForwarder.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";

import "./modules/PluserModule.sol";
import "./scripts/InitializationScriptV1.sol";
import "./Factory.sol";

contract Deploy is Ownable {
    PluserModule public singeltonPluserModule;
    InitializationScriptInterface public initScript;

    Factory public factory;

    function deployPluserModule(bytes calldata pluserModuleCreationBytecode_, bytes calldata initScriptCreationBytecode_) public onlyOwner {
        address _singeltonPluserModule = Create2.deploy(0, keccak256("PluserModule"), abi.encodePacked(pluserModuleCreationBytecode_));

        singeltonPluserModule = PluserModule(_singeltonPluserModule);
        initScript = InitializationScriptV1(Create2.deploy(0, keccak256("InitializationScriptV1"), initScriptCreationBytecode_));
    }

    function deployFactory(
        bytes calldata factoryCreationBytecode_,
        address gnosisSingleton,
        address deployer,
        address verifyer
    ) public onlyOwner {
        require(address(singeltonPluserModule) != address(0x00), "Pluser Module is not deployed");
        require(address(factory) == address(0x00), "Factory is already deployed");

        address _singeltonFactory = Create2.deploy(0, keccak256("Factory"), factoryCreationBytecode_);
        Factory _factory = Factory(
            address(
                new ERC1967Proxy(
                    address(_singeltonFactory),
                    abi.encodeWithSelector(Factory.initialize.selector, initScript, gnosisSingleton, singeltonPluserModule, verifyer)
                )
            )
        );

        factory = _factory;
        _factory.addDeployer(deployer);
    }
}
